FROM python:3.13-slim

RUN groupadd -r eatco && useradd -r -g eatco -d /app -s /sbin/nologin eatco

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=eatco:eatco . .

RUN mkdir -p /app/uploads/recipes && chown -R eatco:eatco /app/uploads

USER eatco

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
