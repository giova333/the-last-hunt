#!/bin/zsh
# Small set-dressing props: Tripo H3.1 with detailed textures (~30 credits each).
export TRIPO_CLIENT_APP=claude
cd "$(dirname "$0")/../art/tripo/props"
STYLE="dark gothic fantasy, weathered, realistic texture, game asset, single object, centered"
gen() { # name face_limit prompt
  tripo generate text-to-model "$3, $STYLE" --model tripo-v3.1 -p texture_quality=detailed -p face_limit=$2 -o $1 --name prop-$1 --yes --no-open --quiet --json > $1.json 2> $1.log; echo "$1 exit $?"
}
gen torch 5000 "wrought iron wall sconce bracket holding a burning wooden torch with a flame" &
gen candelabra 6000 "tall standing wrought iron candelabra with five melted wax candles and wax drips" &
gen chandelier 7000 "round hanging iron chandelier ring with melted candles, hanging from a chain" &
gen barrels 7000 "cluster of three old wooden barrels with rusted iron bands" &
gen crates 6000 "stack of old broken wooden crates" &
wait
gen bones 7000 "pile of human skulls and bones" &
gen tombstone 5000 "weathered gothic gravestone with a carved cross, cracked and mossy" &
gen corpse 6000 "plague victim's body wrapped in a dirty linen burial shroud tied with rope, lying flat" &
gen gargoyle 8000 "crouching stone gargoyle statue with bat wings and horns on a small plinth" &
gen fence 6000 "section of wrought iron spiked fence with gothic finials between two stone posts" &
wait
echo ALL DONE
