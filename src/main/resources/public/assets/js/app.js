var eventTableData = { "headers": [], "rows": [] };

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

function renderTable(parent, step = 1) {
  let sz = eventTableData.headers.length;
  let cols = sz > 4 ? 5 : (cols + 1);

  console.log(`render ${cols}-column table at step ${step}`);

  let grid = $('<div/>').addClass('grid');
  addCell(grid, '', '');
  console.log(eventTableData);
  for(let i = step - 1; i < cols + step - 2; ++i) {
    console.log(`add header ${i} with label ${eventTableData.headers[i].label}`);
    addCell(grid, eventTableData.headers[i].label, 'is-primary');
  }

  for(let i = 0, cell; cell = eventTableData.rows[i]; ++i) {
    if(0 !== i % (sz + 1) && (i % (sz + 1) < step || i % (sz + 1) >= cols + step - 1)) {
      console.log(`skip cell ${i} with label ${cell.label}`);
      continue;
    }
    console.log(`add cell ${i} with label ${cell.label}`);
    addCell(grid, cell.label, 0 === i % (sz + 1) ? 'is-primary' : 'is-outlined is-primary');
  }

  parent.empty()
    .append(
        $('<div/>')
          .addClass(`fixed-grid has-${cols}-cols`)
          .append(grid)
    );
}

var viewTableSliderOutput = $('<output/>')
  .attr('for', 'view-event-slider')
  .hide();

var renderTableSlider = function(parent, step, max, fn) {

  parent.children('input.slider').remove();
  parent
    .append(
        $('<input/>')
          .addClass('slider is-fullwidth is-small is-primary is-light')
          .attr('id', 'view-event-slider')
          .attr('step', '1')
          .attr('min', '1')
          .attr('type', 'range')
          .attr('max', max)
          .attr('value', step)
    ).append(viewTableSliderOutput);

  viewTableSliderOutput.text(step);
  bulmaSlider.attach();

}

$(function() {
  const urlParams = new URLSearchParams(window.location.search);
  if(urlParams.has('event')) {
    console.log(urlParams.get('event'));
  }

  const calendars = bulmaCalendar.attach('[type="date"]', {
    displayMode: 'dialog',
    isRange: true,
    timeFormat: 'hh:mm a',
    type: 'datetime',
    validateLabel: 'Save'
  });

  const viewTableSliderObserver = new MutationObserver(function(mutationsList) {
    mutationsList.forEach(function(mutation) {
      if('characterData' === mutation.type || 'childList' === mutation.type) {
        console.log(`slider moved to ${viewTableSliderOutput.text()}`);
        renderTable($('#view-event-table'), Number(viewTableSliderOutput.text()));
      }
    });
  });

  viewTableSliderObserver.observe(viewTableSliderOutput[0], { childList: true, subtree: true, characterData: true });

  eventTableData = {
    headers: [
      {'label': 'Activity No. 1'},
      {'label': 'Activity No. 2'},
      {'label': 'Activity No. 3'},
      {'label': 'Activity No. 4'},
      {'label': 'Activity No. 5'},
      {'label': 'Activity No. 6'},
      {'label': 'Activity No. 7'},
      {'label': 'Activity No. 8'}
    ],
    rows: [
      {'label': 'Window No. 1'},
      {'label': 'Slot No. 1-1'},
      {'label': 'Slot No. 2-1'},
      {'label': 'Slot No. 3-1'},
      {'label': 'Slot No. 4-1'},
      {'label': 'Slot No. 5-1'},
      {'label': 'Slot No. 6-1'},
      {'label': 'Slot No. 7-1'},
      {'label': 'Slot No. 8-1'},
      {'label': 'Window No. 2'},
      {'label': 'Slot No. 1-2'},
      {'label': 'Slot No. 2-2'},
      {'label': 'Slot No. 3-2'},
      {'label': 'Slot No. 4-2'},
      {'label': 'Slot No. 5-2'},
      {'label': 'Slot No. 6-2'},
      {'label': 'Slot No. 7-2'},
      {'label': 'Slot No. 8-2'},
      {'label': 'Window No. 3'},
      {'label': 'Slot No. 1-3'},
      {'label': 'Slot No. 2-3'},
      {'label': 'Slot No. 3-3'},
      {'label': 'Slot No. 4-3'},
      {'label': 'Slot No. 5-3'},
      {'label': 'Slot No. 6-3'},
      {'label': 'Slot No. 7-3'},
      {'label': 'Slot No. 8-3'},
      {'label': 'Window No. 4'},
      {'label': 'Slot No. 1-4'},
      {'label': 'Slot No. 2-4'},
      {'label': 'Slot No. 3-4'},
      {'label': 'Slot No. 4-4'},
      {'label': 'Slot No. 5-4'},
      {'label': 'Slot No. 6-4'},
      {'label': 'Slot No. 7-4'},
      {'label': 'Slot No. 8-4'}
    ]
  };

  $('#magic-button').on('click', () => {
    renderTable($('#view-event-table'));
    renderTableSlider(
        $('#view-event-table').parent(),
        1,
        eventTableData.headers.length > 4 ? 5 : (eventTableData.headers.length + 1),
        (val) => {
          console.log(`slider: ${val}`);
        }
    );
  });

  $('#create-event-btn').on('click', () => {
    $('#edit-event-modal').addClass('is-active');
  });

  $('#view-event-edit-summary').on('click', () => {
    $('#edit-event-modal').addClass('is-active');
  });

  $('#view-event-add-activity').on('click', () => {
    $('#edit-activity-modal').addClass('is-active');
  });

  $('#view-event-add-window').on('click', () => {
    $('#edit-window-modal').addClass('is-active');
  });

  $('#view-event-add-field').on('click', () => {
    $('#edit-detail-modal').addClass('is-active');
  });

  // close any modal when their respective 'x' is clicked
  $('.modal .modal-close, .modal button.delete').on('click', function() {
    $(this).closest('.modal.is-active').removeClass('is-active');
  });

  // certain switches hide elements
  $('.toggle').on('click keyup', function(e) {
    if("keyup" != e.type || " " == e.which) {
      let elems = [];
      $(this).attr('class').split(/\s+/).forEach((elem) => {
        if(elem.startsWith('toggle-')) {
          console.log(elem);
          $(`.${elem}`).not('.toggle').toggle();
        }
      });
    }
  });

});

