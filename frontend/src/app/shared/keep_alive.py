#!/usr/bin/env python3
"""
keep_alive.py - keeps the TalkingCanvas backend on Render's free tier awake.

Render spins a free web service down after 15 minutes without any incoming
request, and the next visitor then waits ~50+ seconds while it boots again.
This script sends one tiny GET request every 40 seconds, so that 15-minute
idle timer never runs out.

    python keep_alive.py            start pinging   (Windows: py keep_alive.py)
    python keep_alive.py --once     send a single test ping, then exit
    Ctrl+C                          stop

Only the Python standard library is used (Python 3.8+) - nothing to install.
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

# ---- Defaults (edit here, or override with --url / --interval / --timeout) ----
URL = "https://talkingcanvas-ws.onrender.com/api/actuator/health"
INTERVAL_SECONDS = 40
TIMEOUT_SECONDS = 120  # a sleeping Render service needs ~50-90 s to boot
# --------------------------------------------------------------------------------


def log(message):
    print(message, flush=True)


def ping(url, timeout):
    """Send one GET request. Returns (state, detail); state is OK, WARN or FAIL."""
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; TalkingCanvas-KeepAlive/1.0)",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            code = response.status
            body = response.read(4096).decode("utf-8", errors="replace")
    except urllib.error.HTTPError as err:  # server answered with 4xx / 5xx
        return "FAIL", f"HTTP {err.code} {err.reason}"
    except urllib.error.URLError as err:  # no internet, DNS, refused, SSL, timeout...
        return "FAIL", f"no response ({err.reason})"
    except Exception as err:  # anything else: never let the script die
        return "FAIL", f"no response ({type(err).__name__}: {err})"

    # /api/actuator/health always answers HTTP 200 and puts UP/DOWN in the JSON
    # body, so look inside it instead of trusting the status code alone.
    try:
        status = str(json.loads(body).get("status", "?"))
    except (ValueError, AttributeError):
        return "WARN", f"HTTP {code}, but the reply is not the expected JSON"
    if status.upper() == "UP":
        return "OK", f"HTTP {code}, app status UP"
    return "WARN", f"HTTP {code}, app status {status} - check the database"


def block_windows_sleep(enable):
    """Windows only: stop the PC from idling into sleep while the script runs."""
    if sys.platform != "win32":
        return False
    try:
        import ctypes

        flags = 0x80000000 | (0x00000001 if enable else 0)  # ES_CONTINUOUS [| ES_SYSTEM_REQUIRED]
        ctypes.windll.kernel32.SetThreadExecutionState(flags)
        return True
    except Exception:
        return False


def main():
    parser = argparse.ArgumentParser(description="Keep a Render free-tier service awake by pinging it.")
    parser.add_argument("--url", default=URL, help="address to ping (default: %(default)s)")
    parser.add_argument("--interval", type=float, default=INTERVAL_SECONDS,
                        help="seconds between pings (default: %(default)s)")
    parser.add_argument("--timeout", type=float, default=TIMEOUT_SECONDS,
                        help="seconds to wait for each reply (default: %(default)s)")
    parser.add_argument("--once", action="store_true", help="ping once, then exit")
    args = parser.parse_args()

    if args.interval < 1:
        parser.error("--interval must be at least 1 second")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")  # never crash on odd characters (Windows)
    if args.interval >= 840:
        log("WARNING: Render sleeps free services after 15 minutes (900 s) - use a shorter interval.")

    log(f"Pinging {args.url} every {args.interval:g} s - press Ctrl+C to stop.")
    if block_windows_sleep(True):
        log("(Windows sleep is blocked while this script runs.)")

    total = failed = streak = 0
    try:
        while True:
            started = time.monotonic()
            state, detail = ping(args.url, args.timeout)
            took = time.monotonic() - started
            total += 1

            note = "  <- slow: the service was asleep and has just woken up" if took > 15 and state != "FAIL" else ""
            log(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] #{total:<5}{state:<5}{detail} ({took:.1f}s){note}")

            if state == "FAIL":
                failed += 1
                streak += 1
                if streak == 5:
                    log("  !! 5 failed pings in a row - check your internet and the Render dashboard.")
            else:
                if streak:
                    log(f"  -- back online after {streak} failed ping(s).")
                streak = 0

            if args.once:
                return 0 if state == "OK" else 1
            time.sleep(max(0.0, args.interval - took))
    except KeyboardInterrupt:
        log(f"\nStopped. {total} ping(s) sent, {failed} failed.")
        return 0
    finally:
        block_windows_sleep(False)


if __name__ == "__main__":
    sys.exit(main())
