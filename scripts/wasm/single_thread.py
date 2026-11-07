"""固定 Fairy WASM 源码的单线程适配；只在独立构建目录应用，不修改上游仓库。"""
from pathlib import Path

def replace(path, before, after):
    text = path.read_text(encoding="utf-8")
    if text.count(before) != 1:
        raise ValueError(f"单线程适配锚点变化：{path.name}: {before[:60]}")
    path.write_text(text.replace(before, after), encoding="utf-8")

def function(path, signature, body):
    text = path.read_text(encoding="utf-8")
    if text.count(signature) != 1:
        raise ValueError(f"函数锚点变化：{signature}")
    start = text.index(signature)
    opening = text.index("{", start)
    depth = 1
    end = opening + 1
    while depth:
        if text[end] == "{": depth += 1
        if text[end] == "}": depth -= 1
        end += 1
    path.write_text(text[:start] + signature + " {\n" + body + "\n}" + text[end:], encoding="utf-8")

def apply(source):
    src = Path(source) / "src"
    for field in ["  std::mutex mutex;\n", "  std::condition_variable cv;\n", "  NativeThread stdThread;\n"]:
        replace(src / "thread.h", field, "")
    # 搜索在同一 Worker 调用栈运行，只有一个 MainThread 数据对象。
    replace(src / "thread.cpp", "Thread::Thread(size_t n) : idx(n), stdThread(&Thread::idle_loop, this)", "Thread::Thread(size_t n) : idx(n)")
    function(src / "thread.cpp", "Thread::Thread(size_t n) : idx(n)", "  searching = false;")
    function(src / "thread.cpp", "Thread::~Thread()", "  assert(!searching);")
    function(src / "thread.cpp", "void Thread::start_searching()", "  searching = true;\n  search();\n  searching = false;")
    function(src / "thread.cpp", "void Thread::wait_for_search_finished()", "  assert(!searching);")
    function(src / "thread.cpp", "void Thread::idle_loop()", "  // 单线程构建没有后台线程。")
    replace(src / "thread.cpp", "void ThreadPool::set(size_t requested) {", "void ThreadPool::set(size_t requested) {\n  if (requested) requested = 1;")
    function(src / "tt.cpp", "void TranspositionTable::clear()", "  std::memset(table, 0, clusterCount * sizeof(Cluster));")
    replace(src / "ucioption.cpp", 'Option(1, 1, 512, on_threads)', 'Option(1, 1, 1, on_threads)')
    replace(src / "search.cpp", '#include <cassert>', '#include <cassert>\n#include <emscripten.h>')
    polling = '''
  // 定期让出事件循环；消息处理只更新标志，不重入正在挂起的 C++ 搜索。
  emscripten_sleep(0);
  if (EM_ASM_INT({ return Module["qidaoStopRequested"] ? 1 : 0; })) Threads.stop = true;
  if (EM_ASM_INT({ return Module["qidaoPonderhit"] ? 1 : 0; })) ponder = false;
'''
    replace(src / "search.cpp", "  static TimePoint lastInfoTime = now();", polling + "\n  static TimePoint lastInfoTime = now();")
    replace(src / "search.cpp", "  {} // Busy wait for a stop or a ponder reset", "  {" + polling + "  } // 单线程等待必须继续处理 stop / ponderhit。")
    replace(src / "emscripten/utils.h", '    const command = await Module["queue"].get();', '''    const command = await Module["queue"].get();
    if (/^go(?:\\s|$)/.test(command)) {
      Module["qidaoPonderhit"] = false;
      Module["qidaoStopRequested"] = Module["queue"].pendingStop();
    }''')
    make = src / "emscripten/Makefile"
    replace(make, "\t-s USE_PTHREADS=1 \\\n", "")
    replace(make, "\t-s PROXY_TO_PTHREAD=1 \\\n", "\t-s ASYNCIFY_STACK_SIZE=262144 \\\n")
    replace(make, '["emscripten_utils_getline_impl"]', '["emscripten_utils_getline_impl","emscripten_sleep"]')
    replace(src / "Makefile", "\tCXXFLAGS += -DUSE_PTHREADS", "\t# 单线程构建不启用 pthread")
    replace(src / "Makefile", "\t\t\t\tLDFLAGS += -lpthread", "\t\t\t\t# 单线程构建不链接 pthread")
    (src / "emscripten/preamble.js").write_bytes((Path(__file__).parent / "single-preamble.js").read_bytes())
