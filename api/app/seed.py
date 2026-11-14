"""Create the schema from schema.sql (idempotent). Loads no data: that is app.loader."""

import asyncio
from pathlib import Path

from sqlalchemy import text

from app.db import engine

SCHEMA = Path(__file__).with_name("schema.sql")


async def wait_for_db(attempts: int = 30) -> None:
    for i in range(attempts):
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return
        except OSError:
            if i == attempts - 1:
                raise
            await asyncio.sleep(1)


async def main() -> None:
    sql = SCHEMA.read_text()
    await wait_for_db()
    async with engine.begin() as conn:
        # asyncpg's simple-query path runs a multi-statement script in one call
        raw = await conn.get_raw_connection()
        await raw.driver_connection.execute(sql)
    await engine.dispose()
    print(f"schema applied: {SCHEMA.name}")


if __name__ == "__main__":
    asyncio.run(main())
