from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from . import config

pool = ConnectionPool(
    config.DATABASE_URL,
    min_size=1,
    max_size=8,
    kwargs={"row_factory": dict_row},
    open=False,
)


def open_pool():
    pool.open(wait=True, timeout=60)


@contextmanager
def get_conn():
    with pool.connection() as conn:
        yield conn


def fetch_all(sql, params=None):
    with get_conn() as conn:
        return conn.execute(sql, params or ()).fetchall()


def fetch_one(sql, params=None):
    with get_conn() as conn:
        return conn.execute(sql, params or ()).fetchone()


def execute(sql, params=None):
    with get_conn() as conn:
        conn.execute(sql, params or ())
