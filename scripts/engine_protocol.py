"""真实 Fairy-Stockfish 协议回归：坐标、NNUE、候选线路及停止后切换局面。"""

import queue
import re
import subprocess
import threading
import time

RED_START = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1"
BLACK_AFTER_RED = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C4/9/RNBAKABNR b - - 0 1"


class UciSession:
    def __init__(self, executable, args=()):
        self.process = subprocess.Popen([str(executable), *map(str, args)], cwd=executable.parent, stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                        text=True, encoding="utf-8", errors="replace")
        self.lines = queue.Queue()
        self.transcript = []
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.reader.start()

    def _read(self):
        for line in self.process.stdout:
            self.lines.put(line.rstrip())
        self.lines.put(None)

    def send(self, text):
        self.process.stdin.write(text + "\n")
        self.process.stdin.flush()

    def wait(self, prefix, timeout=30):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                line = self.lines.get(timeout=max(.01, deadline - time.monotonic()))
            except queue.Empty:
                break
            if line is None:
                raise ValueError("引擎提前退出：" + "\n".join(self.transcript[-8:]))
            self.transcript.append(line)
            if "ERROR:" in line or line.startswith(("Unknown command", "No such option")):
                raise ValueError("引擎协议或资源错误：" + line)
            if line.startswith(prefix):
                return line
        raise ValueError(f"等待 {prefix} 超时")

    def ready(self):
        self.send("isready")
        self.wait("readyok")

    def search(self, fen, expected=None, depth=3):
        self.ready()
        start = len(self.transcript)
        self.send("position fen " + fen)
        self.send(f"go depth {depth}" + (" searchmoves " + expected if expected else ""))
        move = self.wait("bestmove ")
        if not re.fullmatch(r"bestmove [a-i][0-9][a-i][0-9](?: ponder [a-i][0-9][a-i][0-9])?", move):
            raise ValueError("引擎没有返回棋岛坐标：" + move)
        if expected and move.split()[1] != expected:
            raise ValueError("受限试算的坐标解析不匹配：" + move)
        return self.transcript[start:]

    def close(self):
        if self.process.poll() is None:
            try:
                self.send("quit")
                self.process.wait(timeout=5)
            except (OSError, subprocess.TimeoutExpired):
                self.process.kill()
                self.process.wait()
        self.reader.join(timeout=2)
        self.process.stdin.close()
        self.process.stdout.close()


def check_missing_network(executable, network, args=()):
    # Fairy 仅对以棋种名开头的文件启用对应网络；使用正确前缀测试真正的资源缺失。
    missing = network.with_name("xiangqi-qidao-missing.nnue")
    if missing.exists():
        raise ValueError("负向测试的缺失权重路径已存在")
    session = UciSession(executable, args)
    try:
        session.send("ucicyclone")
        session.send("uci")
        session.wait("uciok")
        for name, value in (("UCI_Variant", "xiangqi"), ("Use NNUE", "true"), ("EvalFile", str(missing))):
            session.send(f"setoption name {name} value {value}")
        session.ready()
        session.send("position fen " + RED_START)
        session.send("go depth 1")
        try:
            session.wait("bestmove ")
        except ValueError as error:
            if "ERROR:" in str(error):
                return {"status": "rejected-as-expected", "transcript": session.transcript}
            raise
        raise ValueError("缺失权重时引擎仍然返回着法，不能确认 NNUE 资源约束")
    finally:
        session.close()


def validate_fairy(executable, network, args=()):
    session = UciSession(executable, args)
    try:
        # 官方版本通过协议命令切换坐标，没有名为 Protocol 的 UCI 选项。
        session.send("ucicyclone")
        session.send("uci")
        session.wait("uciok")
        options = "\n".join(session.transcript)
        for name in ("UCI_Variant", "Use NNUE", "EvalFile", "MultiPV"):
            if f"option name {name} type " not in options:
                raise ValueError("缺少必要 UCI 选项：" + name)
        for name, value in (("UCI_Variant", "xiangqi"), ("Use NNUE", "true"), ("EvalFile", str(network)), ("Threads", 1), ("Hash", 32)):
            session.send(f"setoption name {name} value {value}")
        red = session.search(RED_START, "h2e2")
        if not any("NNUE evaluation using " in line and network.name in line and "enabled" in line for line in red):
            raise ValueError("引擎未确认正在使用指定 NNUE")
        black = session.search(BLACK_AFTER_RED, "h7e7")
        if not all(any(re.search(r"score (?:cp|mate) -?\d+", line) for line in rows) for rows in (red, black)):
            raise ValueError("红黑双方试算缺少评分输出")

        session.send("setoption name MultiPV value 3")
        candidates = session.search(RED_START, depth=3)
        lines = [line for line in candidates if " pv " in line and re.search(r"\bdepth 3\b", line)]
        if {int(re.search(r"multipv (\d+)", line).group(1)) for line in lines} != {1, 2, 3}:
            raise ValueError("MultiPV 未返回三条候选线路")
        for line in lines:
            if not all(re.fullmatch(r"[a-i][0-9][a-i][0-9]", move) for move in line.split(" pv ", 1)[1].split()):
                raise ValueError("PV 包含非棋岛坐标")

        session.send("setoption name MultiPV value 1")
        session.ready()
        session.send("position fen " + RED_START)
        session.send("go infinite")
        session.wait("info depth 2 ")
        start = time.monotonic()
        session.send("stop")
        stopped = session.wait("bestmove ", timeout=5)
        stop_ms = round((time.monotonic() - start) * 1000)
        session.send("ucinewgame")
        reset = session.search(BLACK_AFTER_RED, "h7e7", depth=2)
        session.send("position fen " + RED_START)
        session.send("eval")
        session.wait("Final evaluation")
        if not any(line.startswith("NNUE evaluation ") for line in session.transcript):
            raise ValueError("详细评分中缺少 NNUE 结果")
        return {"status": "passed", "redForcedMove": "h2e2", "blackForcedMove": "h7e7", "multiPv": 3,
                "stopMs": stop_ms, "stopResult": stopped, "resetResult": reset[-1],
                "network": network.name, "transcript": session.transcript,
                "missingNetwork": check_missing_network(executable, network, args),
                "scope": "协议级回归，不代替客户端完整验收或引擎棋力对赛"}
    finally:
        session.close()
