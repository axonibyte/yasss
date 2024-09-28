function addCell(parent, label, aesthetics = 'is-outlined is-primary', fn = null, data = {}) {
  parent.append(
      $('<div/>')
        .addClass('cell')
        .append(
            $('<ul/>')
              .addClass('block-list is-small is-centered')
              .addClass(aesthetics)
              .append(
                  $('<li/>')
                    .text(label)
              )
        )
  );
}

function renderTable(parent, data = {}, step = 1, cols = 5) {
  /*
   headers [
     label: "",
     aesthetics: ""
   ],
   rows [
     label:
     aesthetics:
   ]

so... assume rows are going to have 1 more than headers
because we're gonna have a blank space above the first col

and, the slider (step) is going to determine how many of the
columns we skip

so any 1 == cols % $row is going to be the leader column
e.g. for idx 1, 5 % 1 == 1 and for idx 6, 5 % 1 == 1

and we'll want to skip ($step - 1) rows, starting with all
rows where $cols % $row != 1

so for rows [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18 ]
and for headers [ A, B, C, D, E, F ] (sz = 6)
and for step = 2
and for cols = 4

we're gonna have something like this

    B  C  D  E
 0  2  3  4  5
 7  9 10 11
13 15 16 17
<------------> <-- pretty slider

so given 0-based indices

header start idx = $step - 1  (e.g. $step - 1 == 2 - 1 == 1, header[1] == 'B')
and all rows where idx != 0 && idx >= $step && idx < $cols + $step), so:
  - row idx 0: keep because idx == 0
  - row idx 1: throw because idx == 1 < $step
  - row idx 2: keep because 2 != 0, 2 >= 2, and 2 < 4 + 2
  - row idx 3: keep because 3 != 0, 3 >= 2, and 3 < 4 + 2
  - row idx 4: keep because 4 != 0, 4 >= 2, and 4 < 4 + 2
  - row idx 5: keep because 5 != 0, 5 >= 2, and 5 < 4 + 2
  - row idx 6: throw because 6 == 4 + 2

just don't freak out and forget that row idx is technically obo headers
   */

  parent.empty()
    .append(
        $('<div/>')
          .addClass(`fixed-grid has-${cols}-cols`)
          .append(grid)
    );
}
