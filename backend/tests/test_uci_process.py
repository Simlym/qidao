"""Windows 系统编码与引擎启动失败时的真实子进程回归。"""

import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from app.engine import uci


def redirect_to_python(monkeypatch, script):
    spawn = subprocess.Popen
    processes = []
    def launch(args, **kwargs):
        # 模拟 Windows 默认编码；引擎封装需明确选择正确的协议编码。
        kwargs.setdefault("encoding", "gbk")
        process = spawn([sys.executable, "-u", str(script)], **kwargs)
        processes.append(process)
        return process
    monkeypatch.setattr(uci.subprocess, "Popen", launch)
    return processes


def test_utf8_engine_banner_is_read_on_gbk_windows(tmp_path, monkeypatch):
    script = tmp_path / "engine.py"
    script.write_text('''import sys
sys.stdout.reconfigure(encoding="utf-8")
for line in sys.stdin:
    command = line.strip()
    if command == "uci":
        print("id name 揭棋™®", flush=True)
        print("uciok", flush=True)
    elif command == "isready": print("readyok", flush=True)
    elif command == "quit": break
''', encoding="utf-8")
    processes = redirect_to_python(monkeypatch, script)
    engine = uci.Engine(str(tmp_path / "engine.exe"))
    try:
        assert engine.name == "揭棋™®"
    finally:
        engine.close()
    assert processes[0].poll() is not None
    assert processes[0].stdin.closed and processes[0].stdout.closed


def test_failed_handshake_reaps_process_and_closes_pipes(tmp_path, monkeypatch):
    script = tmp_path / "exit.py"
    script.write_text("import sys\nsys.stdin.readline()\nprint('engine failed', flush=True)\n", encoding="utf-8")
    processes = redirect_to_python(monkeypatch, script)
    with pytest.raises(OSError, match="uciok"):
        uci.Engine(str(tmp_path / "engine.exe"))
    assert processes[0].poll() is not None
    assert processes[0].stdin.closed and processes[0].stdout.closed
