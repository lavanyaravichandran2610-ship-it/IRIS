"""Email address normalisation.

Gmail ignores dots and anything after a plus sign in the part before the @, and treats googlemail.com as
gmail.com. Without this, t.u@gmail.com, tu@gmail.com and tu+x@gmail.com would become three accounts that all
read the same mailbox (and each would get its own code allowance).
"""

GMAIL_DOMAINS = {"gmail.com", "googlemail.com"}


def canonical_email(raw: str) -> str:
    value = (raw or "").strip().lower()
    local, _, domain = value.rpartition("@")
    if domain in GMAIL_DOMAINS:
        local = local.split("+", 1)[0].replace(".", "")
        domain = "gmail.com"
    return f"{local}@{domain}"


def is_usable(address: str) -> bool:
    local, _, domain = address.rpartition("@")
    return bool(local) and bool(domain)
