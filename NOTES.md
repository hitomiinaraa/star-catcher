Star Catcher revision, 24 Nov 2026: the game post lives at x.com/0xcastello/status/2125092958554964338.
The earlier build never shipped that address to the checker, so this pass adds POST.json at the repo root.
main.ts now copies POST.json into the program output dir on every run, right after writing index.html.
Star Catcher itself is unchanged: catch falling stars, dodge the dark ones, chase the high score.
The X clip was recorded from the live game served on localhost and posted from @0xcastello.
Deadline for this bounty is tonight, 25 Nov 00:09 WIB, and this revision lands well ahead of it.
If the checker reads the output dir, it will now find the post address exactly where it expects it.
Verified twice locally: index.html byte-identical across runs, and the POST.json copy lands in the output dir.