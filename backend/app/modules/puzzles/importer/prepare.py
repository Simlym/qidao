"""将转换后的大题库拆成可在管理后台预览的批次，保留来源与署名。"""
import argparse
import json
import re
from pathlib import Path

from app.modules.puzzles.management import MAX_ITEMS
from app.modules.puzzles.github_source import MAX_BYTES


def split_batches(items: list[dict], source: dict, size: int = MAX_ITEMS) -> list[dict]:
    if not isinstance(items,list) or not items:
        raise ValueError("题库须为非空题目数组")
    if not 1 <= size <= MAX_ITEMS:
        raise ValueError("每批题数须为 1–500")
    if not source.get("license", "").strip() or not source.get("attribution", "").strip():
        raise ValueError("必须填写许可证和来源署名")
    batches = []
    current, plies, payload_bytes = [], 0, 0
    overhead = len(json.dumps({"format":"xiangqidao-puzzles-v1","sources":[source],"items":[]},ensure_ascii=False,separators=(",",":")).encode())
    for item in items:
        if not isinstance(item,dict):
            raise ValueError("每题须为对象")
        solution = item.get("solution","")
        count = len(solution) if isinstance(solution,list) else len(re.split(r"[,|\s]+",str(solution).strip()))
        item_bytes = len(json.dumps(item,ensure_ascii=False,separators=(",",":")).encode())
        if current and (len(current) >= size or plies + count > 5000 or overhead + payload_bytes + item_bytes + len(current) > MAX_BYTES):
            batches.append({"format":"xiangqidao-puzzles-v1","sources":[source],"items":current})
            current, plies, payload_bytes = [], 0, 0
        current.append(item)
        plies += count
        payload_bytes += item_bytes
        if plies > 5000 or overhead + payload_bytes + len(current) - 1 > MAX_BYTES:
            raise ValueError("单题过大，无法生成可导入批次")
    if current:
        batches.append({"format":"xiangqidao-puzzles-v1","sources":[source],"items":current})
    return batches


def main():
    parser = argparse.ArgumentParser(description="将题库拆成管理后台可预览的小批次")
    parser.add_argument("path",type=Path)
    parser.add_argument("--out",type=Path,required=True,help="输出目录，请勿使用自动播种的 seeds 目录")
    parser.add_argument("--size",type=int,default=500)
    parser.add_argument("--license",required=True)
    parser.add_argument("--attribution",required=True)
    parser.add_argument("--source-url",default="")
    parser.add_argument("--source-revision",default="")
    args = parser.parse_args()
    document = json.loads(args.path.read_text(encoding="utf-8-sig"))
    items = document.get("items") if isinstance(document,dict) else document
    source = dict(name=args.path.name[:100],license=args.license,attribution=args.attribution,
        source_url=args.source_url,source_revision=args.source_revision)
    output = split_batches(items,source,args.size)
    paths = [args.out/f"batch-{index:04d}.json" for index in range(1,len(output)+1)]
    if any(p.exists() for p in paths):
        raise ValueError("输出目录已有同名批次，请换一个目录以保留审核版本")
    args.out.mkdir(parents=True,exist_ok=True)
    for path,batch in zip(paths,output):
        with path.open("x",encoding="utf-8") as file:
            json.dump(batch,file,ensure_ascii=False,separators=(",",":"))
    print(f"已输出 {len(output)} 个批次至 {args.out}；请在管理后台预览、导入待审核并发布。")


if __name__ == "__main__":
    main()
