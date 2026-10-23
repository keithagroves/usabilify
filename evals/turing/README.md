# Turing check

`real.jsonl` holds real think-aloud excerpts, one JSON object per line:

    {"persona": "novice, 70s", "text": "“Now where would that be.”\n“I don't want to break anything.”"}

Source them from moderated sessions you ran or have rights to. Do not write them yourself: the point is to compare generated lines with real people.

`usabilify turing --n 20` builds a deck mixing real and generated excerpts. Take it in the dashboard (Turing page). A persona is shippable when reviewers catch its lines near chance (about 50%).
