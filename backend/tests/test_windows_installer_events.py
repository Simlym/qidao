"""Windows Selector 事件循环中的进程管道、错误输出和取消回收。"""

import asyncio
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from app.engine import installation

pytestmark = pytest.mark.skipif(os.name != "nt", reason="Windows 热重载事件循环回归")


def redirect(monkeypatch, script):
    spawn = subprocess.Popen
    processes = []
    def launch(args, **kwargs):
        process = spawn([sys.executable, "-u", str(script)], **kwargs)
        processes.append(process)
        return process
    monkeypatch.setattr(installation.subprocess, "Popen", launch)
    monkeypatch.setattr(installation, "installer_path", lambda: sys.executable)
    return processes


def test_selector_loop_reports_exit_and_stderr(tmp_path, monkeypatch, caplog):
    script = tmp_path / "failure.py"
    script.write_text('''import sys,json
sys.stderr.reconfigure(encoding="utf-8")
print(json.dumps({"type":"progress","data":{"phase":"testing"}}),flush=True)
print("安装器诊断失败",file=sys.stderr,flush=True)
sys.exit(7)
''', encoding="utf-8")
    processes = redirect(monkeypatch, script)
    async def collect():
        events = []
        with pytest.raises(ValueError, match="退出码 7"):
            async for event in installation.events("jieqi", "download", "fixture"):
                events.append(event)
        assert events[0]["data"]["phase"] == "testing"
    with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
        runner.run(collect())
    assert "安装器诊断失败" in caplog.text
    assert processes[0].poll() == 7


def test_selector_loop_cancellation_stops_installer(tmp_path, monkeypatch):
    script = tmp_path / "cancel.py"
    script.write_text('''import sys,json
print(json.dumps({"type":"progress","data":{"phase":"testing"}}),flush=True)
assert sys.stdin.readline().strip()=="cancel"
''', encoding="utf-8")
    processes = redirect(monkeypatch, script)
    async def cancel():
        source = installation.events("jieqi", "download", "fixture")
        assert (await anext(source))["data"]["phase"] == "testing"
        await source.aclose()
    with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
        runner.run(cancel())
    assert processes[0].poll() == 0
    assert processes[0].stdin.closed and processes[0].stdout.closed
