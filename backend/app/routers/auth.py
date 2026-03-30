import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models.user import Family, User
from app.schemas.user import (
    FamilyCreate,
    FamilyJoin,
    FamilyResponse,
    FamilySettingsUpdate,
    LoginRequest,
    UserCreate,
    UserResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

SECRET_KEY = settings.secret_key
ALGORITHM = "HS256"
COOKIE_NAME = "eatco_token"
COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


async def generate_unique_invite_code(db: AsyncSession) -> str:
    """DB에서 중복되지 않는 초대 코드를 생성합니다."""
    for _ in range(10):
        code = secrets.token_urlsafe(8).upper().replace("-", "").replace("_", "")[:8]
        existing = await db.execute(select(Family).where(Family.invite_code == code))
        if not existing.scalar_one_or_none():
            return code
    raise HTTPException(status_code=500, detail="초대 코드 생성에 실패했습니다.")


def create_access_token(user_id: str, session_token: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    return jwt.encode({"sub": user_id, "sid": session_token, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def set_auth_cookie(response: Response, token: str) -> None:
    """Set httpOnly secure cookie with JWT token."""
    is_production = settings.environment == "production"
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=is_production,
        samesite="lax",
        path="/",
    )


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    eatco_token: str | None = Cookie(None),
) -> User:
    """Extract user from httpOnly cookie JWT token."""
    if not eatco_token:
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    try:
        payload = jwt.decode(eatco_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="토큰이 만료되었습니다.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")

    session_token = payload.get("sid")
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="사용자를 찾을 수 없습니다.")
    # 세션 토큰 검증 (단일 세션 강제)
    if session_token and user.session_token != session_token:
        raise HTTPException(status_code=401, detail="다른 기기에서 로그인되어 세션이 만료되었습니다.")
    return user


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(data: UserCreate, response: Response, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 등록된 이메일입니다.")

    # 1인 가족 자동 생성
    invite_code = await generate_unique_invite_code(db)
    family = Family(name=f"{data.nickname}의 냉장고", invite_code=invite_code)
    db.add(family)
    await db.flush()

    session_tok = secrets.token_urlsafe(32)
    user = User(
        email=data.email,
        nickname=data.nickname,
        hashed_password=hash_password(data.password),
        family_id=family.id,
        session_token=session_tok,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id), session_tok)
    set_auth_cookie(response, token)
    return user


@router.post("/login", response_model=UserResponse)
async def login(data: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    # 새 세션 토큰 발급 → 이전 세션 무효화
    session_tok = secrets.token_urlsafe(32)
    user.session_token = session_tok
    await db.commit()

    token = create_access_token(str(user.id), session_tok)
    set_auth_cookie(response, token)
    return user


@router.post("/logout")
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    eatco_token: str | None = Cookie(None),
):
    # 세션 토큰 무효화
    if eatco_token:
        try:
            payload = jwt.decode(eatco_token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            if user_id:
                result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
                user = result.scalar_one_or_none()
                if user:
                    user.session_token = None
                    await db.commit()
        except jwt.InvalidTokenError:
            pass
    is_production = settings.environment == "production"
    response.delete_cookie(key=COOKIE_NAME, path="/", httponly=True, secure=is_production, samesite="lax")
    return {"message": "로그아웃 되었습니다."}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/family", response_model=FamilyResponse, status_code=201)
async def create_family(
    data: FamilyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """새 가족 그룹을 생성하고 초대 코드를 발급합니다."""
    invite_code = await generate_unique_invite_code(db)
    family = Family(name=data.name, invite_code=invite_code, master_id=current_user.id)
    db.add(family)
    await db.flush()

    current_user.family_id = family.id
    await db.commit()

    result = await db.execute(
        select(Family).where(Family.id == family.id).options(selectinload(Family.members))
    )
    return result.scalar_one()


@router.post("/family/join", response_model=FamilyResponse)
async def join_family(
    data: FamilyJoin,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """초대 코드로 다른 가족 그룹에 참여합니다. 기존 가족에서 탈퇴됩니다. 참여 후 초대코드가 갱신됩니다."""
    result = await db.execute(
        select(Family).where(Family.invite_code == data.invite_code).options(selectinload(Family.members))
    )
    family = result.scalar_one_or_none()
    if not family:
        raise HTTPException(status_code=404, detail="유효하지 않은 초대 코드입니다.")

    # 기존 가족 ID 보관
    old_family_id = current_user.family_id

    # 먼저 새 가족으로 변경 후 flush
    current_user.family_id = family.id
    await db.flush()

    # 기존 1인 가족이면 빈 가족 삭제
    if old_family_id and old_family_id != family.id:
        old_family_result = await db.execute(
            select(Family).where(Family.id == old_family_id).options(selectinload(Family.members))
        )
        old_family = old_family_result.scalar_one_or_none()
        if old_family and len(old_family.members) == 0:
            await db.delete(old_family)

    # 참여 후 초대코드 갱신 (유출 방지 — 1회용)
    new_code = await generate_unique_invite_code(db)
    family.invite_code = new_code
    await db.commit()

    # commit 후 fresh query — selectinload로 members 새로 로드
    family_result = await db.execute(
        select(Family).where(Family.id == family.id).options(selectinload(Family.members)).execution_options(populate_existing=True)
    )
    return family_result.scalar_one()


@router.get("/family/{family_id}", response_model=FamilyResponse)
async def get_family(
    family_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.family_id != family_id:
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다.")
    result = await db.execute(
        select(Family).where(Family.id == family_id).options(selectinload(Family.members))
    )
    family = result.scalar_one_or_none()
    if not family:
        raise HTTPException(status_code=404, detail="가족 그룹을 찾을 수 없습니다.")
    return family


@router.put("/family/settings", response_model=FamilyResponse)
async def update_family_settings(
    data: FamilySettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """가족 그룹 설정 변경 (공동편집, 유통기한 리포트). 마스터만 가능."""
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="가족 그룹이 없습니다.")

    result = await db.execute(
        select(Family).where(Family.id == current_user.family_id).options(selectinload(Family.members))
    )
    family = result.scalar_one_or_none()
    if not family:
        raise HTTPException(status_code=404, detail="가족 그룹을 찾을 수 없습니다.")

    if family.master_id != current_user.id:
        raise HTTPException(status_code=403, detail="가족 설정은 마스터만 변경할 수 있습니다.")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(family, key, value)
    await db.commit()
    await db.refresh(family)

    result = await db.execute(
        select(Family).where(Family.id == family.id).options(selectinload(Family.members))
    )
    return result.scalar_one()


@router.post("/family/leave", response_model=UserResponse)
async def leave_family(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """가족 그룹에서 탈퇴합니다. 1인 가족이면 탈퇴 불가."""
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="가족 그룹이 없습니다.")

    result = await db.execute(
        select(Family).where(Family.id == current_user.family_id).options(selectinload(Family.members))
    )
    family = result.scalar_one_or_none()
    if not family:
        raise HTTPException(status_code=404, detail="가족 그룹을 찾을 수 없습니다.")

    if len(family.members) <= 1:
        raise HTTPException(status_code=400, detail="1인 가족에서는 탈퇴할 수 없습니다.")

    # 새 1인 가족 생성
    new_invite = await generate_unique_invite_code(db)
    new_family = Family(name=f"{current_user.nickname}의 냉장고", invite_code=new_invite)
    db.add(new_family)
    await db.flush()

    current_user.family_id = new_family.id
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/family/kick/{user_id}")
async def kick_member(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """가족 구성원을 내보냅니다. 마스터(첫 번째 멤버)만 가능."""
    import uuid as _uuid
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="가족 그룹이 없습니다.")

    result = await db.execute(
        select(Family).where(Family.id == current_user.family_id).options(selectinload(Family.members))
    )
    family = result.scalar_one_or_none()
    if not family:
        raise HTTPException(status_code=404, detail="가족 그룹을 찾을 수 없습니다.")

    # 마스터 확인
    if family.master_id != current_user.id:
        raise HTTPException(status_code=403, detail="마스터만 구성원을 내보낼 수 있습니다.")

    # 대상 유저 찾기
    try:
        target_uid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="잘못된 사용자 ID입니다.")

    target = None
    for m in family.members:
        if m.id == target_uid:
            target = m
            break

    if not target:
        raise HTTPException(status_code=404, detail="해당 구성원을 찾을 수 없습니다.")

    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="자기 자신은 내보낼 수 없습니다.")

    # 내보낸 유저에게 새 1인 가족 생성
    new_invite = await generate_unique_invite_code(db)
    new_family = Family(name=f"{target.nickname}의 냉장고", invite_code=new_invite)
    db.add(new_family)
    await db.flush()

    target.family_id = new_family.id
    await db.commit()
    return {"kicked": True, "user": target.nickname}
