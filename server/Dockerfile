# 두근컴퍼니 HQ — FastAPI 백엔드 컨테이너
# Build: docker build -t company-hq-server .
# Run:   docker run -p 8000:8000 --env-file ../.env company-hq-server

FROM python:3.14-slim AS base

# 시스템 의존성 (git + sqlite + 빌드 도구)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# pip 캐시 활용 — requirements.txt 만 변경 안 됐으면 layer 재사용
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 소스 복사
COPY . /app/

# 런타임 디렉토리 (런타임 데이터는 볼륨으로 마운트)
RUN mkdir -p /app/diag /app/logs /app/chat_history /app/doogeun_state_backups

EXPOSE 8000

# uvicorn — reload 없음 (프로덕션). 개발은 docker-compose override 로
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
