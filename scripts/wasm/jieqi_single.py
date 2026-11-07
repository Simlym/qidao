"""固定揭棋源码的无权重单线程适配；所有修改均随候选打包。"""
from pathlib import Path
from .single_thread import replace, function

def apply(source):
    src = Path(source) / "src"
    if "#define USE_NNUEEVAL 0" not in (src / "types.h").read_text():
        raise ValueError("上游不再默认使用传统评估，停止无权重构建")
    for field in ["  std::mutex mutex;\n", "  std::condition_variable cv;\n", "  NativeThread stdThread;\n"]:
        replace(src / "thread.h", field, "")
    replace(src / "thread.cpp", "Thread::Thread(size_t n) : idx(n), stdThread(&Thread::idle_loop, this)", "Thread::Thread(size_t n) : idx(n)")
    function(src / "thread.cpp", "Thread::Thread(size_t n) : idx(n)", "  searching = false;")
    function(src / "thread.cpp", "Thread::~Thread()", "  assert(!searching);")
    function(src / "thread.cpp", "void Thread::start_searching()", "  searching = true;\n  search();\n  searching = false;")
    function(src / "thread.cpp", "void Thread::wait_for_search_finished()", "  assert(!searching);")
    function(src / "thread.cpp", "void Thread::idle_loop()", "  // 单线程构建没有后台线程。")
    replace(src / "thread.cpp", "void ThreadPool::set(size_t requested) {", "void ThreadPool::set(size_t requested) {\n  if (requested) requested = 1;")
    function(src / "tt.cpp", "void TranspositionTable::clear()", "  std::memset(table, 0, clusterCount * sizeof(Cluster));")
    replace(src / "ucioption.cpp", "Option(1, 1, 1024, on_threads)", "Option(1, 1, 1, on_threads)")
    # 固定 Emscripten 2.0.26 的 libc++ 只在全局命名空间提供 aligned_alloc。
    replace(src / "misc.cpp", "std::aligned_alloc(", "::aligned_alloc(")
    replace(src / "ucioption.cpp", '  o["EvalFile"]              << Option(EvalFileDefaultName, on_eval_file);', '  // 此候选只使用上游传统评估，不接受 NNUE 文件。')
    function(src / "evaluate.cpp", "void NNUE::init()", "  // 无权重候选不读取任何 NNUE 文件。")
    function(src / "evaluate.cpp", "void NNUE::verify()", '  sync_cout << "info string Qidao classical evaluation enabled" << sync_endl;')
    replace(src / "search.cpp", "#include <cassert>", "#include <cassert>\n#include <emscripten.h>")
    poll = '''
  emscripten_sleep(0);
  if (EM_ASM_INT({ return Module["qidaoStopRequested"] ? 1 : 0; })) Threads.stop = true;
  if (EM_ASM_INT({ return Module["qidaoPonderhit"] ? 1 : 0; })) ponder = false;
'''
    replace(src / "search.cpp", "  static TimePoint lastInfoTime = now();", poll + "\n  static TimePoint lastInfoTime = now();")
    replace(src / "search.cpp", "  {} // Busy wait for a stop or a ponder reset", "  {" + poll + "  }")
    replace(src / "uci.cpp", "#include <iostream>", '#include <iostream>\n#include "qidao_getline.h"')
    replace(src / "uci.cpp", '      if (argc == 1 && !getline(cin, cmd)) // Wait for an input or an end-of-file (EOF) indication\n          cmd = "quit";', '      if (argc == 1) qidao_getline(cmd);')
    (src / "qidao_getline.h").write_text('''#include <emscripten.h>
#include <string>
#include <cstdlib>
EM_JS(char*, qidao_getline_impl, (), {
  return Asyncify.handleAsync(async () => {
    const command = await Module["queue"].get();
    if (/^go(?:\\s|$)/.test(command)) {
      Module["qidaoPonderhit"] = false;
      Module["qidaoStopRequested"] = Module["queue"].pendingStop();
    }
    const pointer = _malloc(lengthBytesUTF8(command) + 1);
    stringToUTF8(command, pointer, lengthBytesUTF8(command) + 1);
    return pointer;
  });
});
void qidao_getline(std::string& result) {
  char* pointer = qidao_getline_impl();
  result = pointer;
  std::free(pointer);
}
''', encoding="utf-8")
    (src / "qidao-preamble.js").write_bytes((Path(__file__).parent / "single-preamble.js").read_bytes())
