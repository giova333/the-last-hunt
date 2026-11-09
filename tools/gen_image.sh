#!/bin/zsh
# Generate one concept/UI image with Codex's image tool (ChatGPT plan quota, no Tripo credits).
# Usage: tools/gen_image.sh <out.png> <square|wide|tall> "<prompt>" [ref.png ...]
#   ref images are attached so the result matches their style.
# Exits non-zero unless a fresh PNG lands at <out.png>.
set -e
[[ $# -ge 3 ]] || { echo "usage: $0 out.png square|wide|tall \"prompt\" [ref.png ...]" >&2; exit 2; }
out=${1:A}; shape=$2; prompt=$3; shift 3
case $shape in
  square) aspect="square 1:1" ;;
  wide)   aspect="wide landscape, the widest aspect ratio available" ;;
  tall)   aspect="tall portrait, the tallest aspect ratio available" ;;
  *) echo "shape must be square, wide or tall" >&2; exit 2 ;;
esac
refs=(); for r in "$@"; do refs+=(-i "${r:A}"); done
mkdir -p "${out:h}"; rm -f "$out"
style=""; (( $# )) && style=" Match the art style, palette, line weight and rendering of the attached reference image(s); use them for style only, not content."
# Prompt first: `-i` takes several files and would swallow a prompt placed after it.
# stdin from /dev/null: otherwise codex waits for "additional input" forever.
codex exec --skip-git-repo-check -s workspace-write -C "${out:h}" \
  "Generate exactly one image with your image generation tool. Format: $aspect. $prompt$style Save it as PNG to $out and reply with only that path." \
  "${refs[@]}" < /dev/null > "${out:r}.codex.log" 2>&1 || { tail -5 "${out:r}.codex.log" >&2; exit 1; }
[[ -s $out ]] || { echo "no image written; see ${out:r}.codex.log" >&2; exit 1; }
rm -f "${out:r}.codex.log"
sips -g pixelWidth -g pixelHeight "$out" | awk 'NR>1{printf "%s ", $2} END{print ""}' | sed "s|^|$out |"
