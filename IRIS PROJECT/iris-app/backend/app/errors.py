"""One error shape for the whole API: {"detail": "<message the user can read>", ...extras}."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(self, status: int, message: str, headers: dict[str, str] | None = None, **extra):
        self.status = status
        self.message = message
        self.headers = headers or {}
        self.extra = extra


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return JSONResponse(
            {"detail": exc.message, **exc.extra}, status_code=exc.status, headers=exc.headers
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        msg = "The request was not valid."
        errs = exc.errors()
        if errs:
            raw = str(errs[0].get("msg", ""))
            msg = raw.removeprefix("Value error, ") or msg
            if errs[0].get("type") == "missing":
                msg = "A required field is missing."
        return JSONResponse({"detail": msg}, status_code=422)
