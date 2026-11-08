#!/bin/zsh
export TRIPO_CLIENT_APP=claude
cd "$(dirname "$0")/../art/tripo/props"
STYLE="dark gothic fantasy, weathered, realistic PBR-style texture, game asset, single object, centered"
gen() { # name face_limit prompt
  tripo generate text-to-model "$3, $STYLE" -p face_limit=$2 -o $1 --name prop-$1 --yes --no-open --quiet --json > $1.json 2> $1.log; echo "$1 exit $?"
}
gen statue 12000 "weathered stone statue of a hooded robed saint with bowed head and hands clasped in prayer, standing on a square stone plinth, cracked dark grey stone with moss" &
gen lamp 6000 "tall wrought iron gothic street lamp post with an ornate four-sided glass lantern and candle inside, decorative iron finial and scrolls" &
gen doorway 10000 "gothic stone pointed-arch doorway with a heavy dark wooden double door, iron studs and hinges, carved stone frame, two steps" &
gen balustrade 8000 "section of a weathered stone balustrade railing, a row of gothic arched balusters between two square stone pillars with caps" &
gen cart 10000 "broken medieval wooden cart with two large spoked wooden wheels, loaded with old sacks, crates and debris" &
gen cage 6000 "rusted iron hanging gibbet cage with a dome top and a heavy chain above it" &
gen tree 15000 "gnarled twisted dead oak tree with a thick knotted trunk, exposed roots and bare crooked branches with a few dark red leaves" &
gen coffins 10000 "pile of old wooden coffins and a stone sarcophagus with iron bands, partly broken" &
wait
echo ALL DONE
