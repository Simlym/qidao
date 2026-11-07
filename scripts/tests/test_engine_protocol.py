"""检查协议回归工具能识别坐标错误和静默降级，不把握手成功当作 NNUE 成功。"""

from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine_protocol import validate_fairy

FAKE = r'''
import sys
mode = False
network = ''
black = False
multi = 1
for raw in sys.stdin:
    line = raw.strip()
    if line == 'ucicyclone': mode = True
    elif line == 'uci':
        for name in ('UCI_Variant', 'Use NNUE', 'EvalFile', 'MultiPV'):
            print(f'option name {name} type string default none')
        print('uciok', flush=True)
    elif line == 'isready': print('readyok', flush=True)
    elif line.startswith('setoption name EvalFile value '): network = line.split(' value ', 1)[1]
    elif line.startswith('setoption name MultiPV value '): multi = int(line.rsplit(' ', 1)[1])
    elif line.startswith('position fen '): black = ' b ' in line
    elif line.startswith('go '):
        if 'qidao-missing.nnue' in network:
            print('info string ERROR: NNUE network was not loaded successfully', flush=True)
            break
        if '--classical' not in sys.argv: print(f'info string NNUE evaluation using {network} enabled')
        for i in range(1, multi + 1):
            move = 'h7e7' if black else 'h2e2'
            if not mode or '--wrong-coordinates' in sys.argv: move = 'h3e3'
            print(f'info depth 3 multipv {i} score cp 12 pv {move}')
        if line == 'go infinite': print('info depth 2 score cp 12 pv h2e2', flush=True)
        else: print(f'bestmove {move}', flush=True)
    elif line == 'stop': print('bestmove h2e2', flush=True)
    elif line == 'eval': print('NNUE evaluation 0.1\nFinal evaluation 0.1', flush=True)
    elif line == 'quit': break
'''


class ProtocolTests(unittest.TestCase):
    def run_fake(self, *args):
        with tempfile.TemporaryDirectory() as directory:
            script = Path(directory) / "fake.py"
            script.write_text(FAKE, encoding="utf-8")
            return validate_fairy(Path(sys.executable), Path(directory) / "test.nnue", [script, *args])

    def test_正确握手及权重输出通过(self):
        report = self.run_fake()
        self.assertEqual(report["status"], "passed")
        self.assertEqual(report["missingNetwork"]["status"], "rejected-as-expected")

    def test_静默使用传统评估不能通过(self):
        with self.assertRaisesRegex(ValueError, "未确认正在使用指定 NNUE"):
            self.run_fake("--classical")

    def test_错误坐标不能通过(self):
        with self.assertRaisesRegex(ValueError, "坐标解析不匹配"):
            self.run_fake("--wrong-coordinates")


if __name__ == "__main__":
    unittest.main()
