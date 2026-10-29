
from fastapi import FastAPI

app = FastAPI(
    title="IRIS 2.0 Backend",
    description="Intelligent Research & Innovation System API",
    version="0.1.0",
)


@app.get("/")
def root():
    return {
        "message": "Welcome to IRIS 2.0 Backend",
        "status": "running",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "iris-backend",
    }
