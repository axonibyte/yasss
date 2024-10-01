var eventTableData = {
  "headers": [],
  "rows": []
};

var eventChanges = {};

function addCell(parent, label, aesthetics = 'is-outlined is-primary', fn = null, data = {}) {
  let cell = $('<div/>')
    .addClass('cell')
    .append(
        $('<ul/>')
          .addClass('block-list is-small is-centered')
          .addClass(aesthetics)
          .append(
              $('<li/>')
                .text(label)
          )
    );

  parent.append(cell);

  if('function' === typeof fn) {
    cell.on('click', function() {
      fn(data);
    });
  }
}

function renderTableMeta(title, description, editable) {
  $('#view-event-short-descr').text(title);
  $('#view-event-long-descr').text(description);
  if(editable) {
    $('#view-event-details').show();
    $('#view-event-edit-summary').parent().show();
  } else {
    $('#view-event-details').hide();
    $('#view-event-edit-summary').parent().hide();
  }
}

function renderTable(parent, step = 1) {
  let sz = eventTableData.headers.length;
  let cols = sz > 4 ? 5 : (sz + 1);

  console.log(`render ${cols}-column table at step ${step}`);

  let grid = $('<div/>').addClass('grid');
  addCell(grid, '', '');
  console.log(eventTableData);
  for(let i = step - 1; i < cols + step - 2; ++i) {
    console.log(`add header ${i} with label ${eventTableData.headers[i].label}`);
    addCell(
        grid,
        eventTableData.headers[i].label,
        'is-primary',
        eventTableData.headers[i].fn,
        eventTableData.headers[i].data);
  }

  for(let i = 0, cell; cell = eventTableData.rows[i]; ++i) {
    if(0 !== i % (sz + 1) && (i % (sz + 1) < step || i % (sz + 1) >= cols + step - 1)) {
      console.log(`skip cell ${i} with label ${cell.label}`);
      continue;
    }
    console.log(`add cell ${i} with label ${cell.label}`);
    addCell(
        grid,
        cell.label,
        0 !== i % (sz + 1)
            ? '' !== cell.aesthetics
                ? cell.aesthetics
                : 'is-outlined is-primary'
            : 'is-primary',
        cell.fn,
        cell.data
    );
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

function renderTableSlider(parent, step = 1, max = null) {
  if(null == max)
    max = eventTableData.headers.length > 4 ? 5 : (eventTableData.headers.length + 1);
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

function renderEventSummaryModal(newEvent = true, savFn = null, summary = {
  title: '',
  description: '',
  notifyOnSignup: true,
  allowMultiuserSignups: false
}) {
  $('#edit-event-submit').unbind('click');

  $('#edit-event-modal p.modal-card-title').text(
      newEvent ? 'Create an Event' : 'Update an Event');

  $('#edit-event-short-descr').attr('value', summary.title);
  $('#edit-event-long-descr').text(summary.description);
  $('#edit-event-notify-switch').prop('checked', summary.notifyOnSignup);
  $('#edit-event-multiuser-switch').prop('checked', summary.allowMultiuserSignups);

  if('function' === typeof savFn) {
    $('#edit-event-submit').on('click', function() {
      if(savFn(summary))
        $('#edit-event-modal').removeClass('is-active');
    });
  }

  $('#edit-event-modal').addClass('is-active');  
}

function renderEventActivityModal(newActivity = true, savFn = null, delFn = null, activity = {
  label: '',
  description: '',
  activityVolunteerCap: -1,
  slotVolunteerCapDefault: -1
}) {
  console.log(activity);

  $('#edit-activity-sav').unbind('click');
  $('#edit-activity-del').unbind('click');

  $('#edit-activity-modal p.modal-card-title').text(
      newActivity ? 'Add an Activity' : 'Update an Activity');

  $('#edit-activity-short-descr').val(activity.label);
  $('#edit-activity-long-descr').val(activity.description);
  if(-1 == activity.activityVolunteerCap) {
    $('#edit-activity-vol-cap-switch').prop('checked', true);
    $('#edit-activity-vol-cap-field').val('');
    $('.toggle-activity-vol-cap').not('.toggle').hide();
  } else {
    $('#edit-activity-vol-cap-switch').prop('checked', false);
    $('#edit-activity-vol-cap-field').val(activity.activityVolunteerCap);
    $('.toggle-activity-vol-cap').not('.toggle').show();
  }
  if(-1 == activity.slotVolunteerCapDefault) {
    $('#edit-activity-slot-vol-cap-def-switch').prop('checked', true);
    $('#edit-activity-slot-vol-cap-def-field').val('');
    $('.toggle-slot-vol-def-cap').not('.toggle').hide();
  } else {
    $('#edit-activity-slot-vol-cap-def-switch').prop('checked', false);
    $('#edit-activity-slot-vol-cap-def-field').val(activity.slotVolunteerCapDefault);
    $('.toggle-slot-vol-def-cap').not('.toggle').show();
  }

  if('function' === typeof savFn)
    $('#edit-activity-sav').on('click', function() {
      if(savFn(activity))
        $('#edit-activity-modal').removeClass('is-active');
    }).show();
  else $('#edit-activity-sav').hide();

  if('function' === typeof delFn)
    $('#edit-activity-del').on('click', function() {
      if(delFn(activity))
        $('#edit-activity-modal').removeClass('is-active');
    }).show();
  else $('#edit-activity-del').hide();

  $('#edit-activity-modal').addClass('is-active');
}

function renderEventWindowModal(newWindow = true, savFn = null, delFn = null, window = {
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: ''
}) {
  $('#edit-window-sav').unbind('click');
  $('#edit-window-del').unbind('click');

  $('#edit-window-modal p.modal-card-title').text(
      newWindow ? 'Add a Window' : 'Update a Window');

  let cal = $('#edit-window-range')[0].bulmaCalendar;
  if('' == startDate || '' == startTime || '' == endDate || '' == endTime)
    cal.clear();
  else {
    cal.startDate = window.startDate;
    cal.startTime = window.startTime;
    cal.endDate = window.endDate;
    cal.endTime = window.endTime;
    cal.save();
  }

  if('function' === typeof savFn)
    $('#edit-window-sav').on('click', function() {
      if(savFn(window))
        $('#edit-window-modal').removeClass('is-active');
    }).show();
  else $('#edit-window-sav').hide();

  if('function' === typeof delFn)
    $('#edit-window-del').on('click', function() {
      if(delFn(window))
        $('#edit-window-modal').removeClass('is-active');
    }).show();
  else $('#edit-window-del').hide();

  $('#edit-window-modal').addClass('is-active');
}

function renderEventDetailModal(newDetail = true, savFn = null, delFn = null, detail = {
  'type': '',
  'field': '',
  'description': '',
  'required': false
}) {
  $('#edit-detail-sav').unbind('click');
  $('#edit-detail-del').unbind('click');

  $('#edit-detail-modal p.modal-card-title').text(
      newDetail ? 'Add a Detail' : 'Update a Detail');

  if('' == detail.type)
    $('#edit-detail-type-dropdown option:contains("?")').prop('selected', true);
  else $(`#edit-detail-type-dropdown option[value="${detail.type}"]`).prop('selected', true);

  $('#edit-detail-field').val(detail.field);
  $('#edit-detail-descr').val(detail.field);
  $('#edit-detail-required-switch').prop('checked', detail.required);

  if('function' === typeof savFn)
    $('#edit-detail-sav').on('click', function() {
      if(savFn(detail))
        $('#edit-detail-modal').removeClass('is-active');
    }).show();
  else $('#edit-detail-sav').hide();

  if('function' === typeof delFn)
    $('#edit-detail-del').on('click', function() {
      if(delFn(detail))
        $('#edit-detail-modal').removeClass('is-active');
    }).show();
  else $('#edit-detail-del').hide();

  $('#edit-detail-modal').addClass('is-active');
}

function renderEventSlotModal(newSlot = true, savFn = null, slot = {
  'activitySummary': '',
  'activityEditFn': null,
  'windowSummary': '',
  'windowEditFn': null,
  'slotEnabled': true,
  'slotVolunteerCap': -1
}) {
  $('#edit-slot-sav').unbind('click');

  $('#edit-slot-modal p.modal-card-title').text(
      newEvent ? 'Add a Slot' : 'Update a Slot');

  $('#edit-slot-activity-field').val(slot.activitySummary);

  if('function' === typeof slot.activityEditFn) {
    $('#edit-slot-activity-btn').on('click', () => {
      slot.activityEditFn();
    }).show();
  } else $('#edit-slot-activity-btn').hide();

  $('#edit-slot-window-field').val(slot.windowSummary);

  if('function' === typeof slot.windowEditFn) {
    $('#edit-slot-window-btn').on('click', () => {
      slot.windowEditFn();
    }).show();
  } else $('#edit-slot-window-btn').hide();

  if(slot.slotEnabled) {
    $('#edit-slot-enable-switch').prop('checked', true);
    $('#edit-slot-cap-fields').show();
  } else {
    $('#edit-slot-enable-switch').prop('checked', false);
    $('#edit-slot-cap-fields').hide();
  }

  if(-1 == slot.slotVolunteerCap) {
    $('#edit-slot-vol-cap-switch').prop('checked', true);
    $('#edit-slot-vol-cap-field').val('');
    $('.toggle-slot-vol-cap').not('.toggle').hide();
  } else {
    $('#edit-slot-vol-cap-switch').prop('checked', false);
    $('#edit-slot-vol-cap-field').val(slot.slotVolunteerCap);
    $('.toggle-slot-vol-cap').not('.toggle').show();
  }

  if('function' === typeof savFn)
    $('#edit-slot-sav').on('click', function() {
      if(savFn(slot))
        $('#edit-slot-modal').removeClass('is-active');
    }).show();
  else $('#edit-slot-sav').hide();

  $('#edit-slot-modal').addClass('is-active');
}

function refreshTable() {
  renderTable($('#view-event-table'));
  renderTableSlider($('#view-event-table').parent());
}

function getActivityModalVals(newVals = null) {
  let data = {
    label: $('#edit-activity-short-descr').val(),
    description: $('#edit-activity-long-descr').val(),
    activityVolunteerCap: $('#edit-activity-vol-cap-switch').prop('checked')
        ? -1 : $('#edit-activity-vol-cap-field').val(),
    slotVolunteerCapDefault: $('#edit-activity-slot-vol-cap-def-switch').prop('checked')
        ? -1 : $('#edit-activity-slot-vol-cap-def-field').val()
  }
  return null != newVals ? Object.assign(data, newVals) : data;
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

  $('#magic-button').on('click', () => {
    eventTableData = { "headers": [], "rows": [] };
    for(let header = 1; header <= 8; header++)
      eventTableData.headers.push({
        label: `Activity #${header}`,
        fn: (data) => {
          $('#edit-activity-modal').addClass('is-active');
        }
      });
    for(let row = 0; row < 4; row++) {
      eventTableData.rows.push({
        label: `Window #${row + 1}`,
        fn: (data) => {
          $('#edit-window-modal').addClass('is-active');
        }
      });
      for(let col = 0; col < 8; col++) {
        eventTableData.rows.push({
          label: `Slot #${row + 1}-${col + 1}`,
          fn: (data) => {
            $('#edit-slot-modal').addClass('is-active');
          }
        });
      }
    }

    refreshTable();
  });

  // for when someone hits the 'create event' nav item
  $('#create-event-btn').on('click', () => {
    eventTableData = {
      "headers": [],
      "rows": []
    };
    renderEventSummaryModal(newEvent = true, fn = function(summary) {
      renderTableMeta(
        $('#edit-event-short-descr').val(),
        $('#edit-event-long-descr').val(),
        true);
      refreshTable();
      $('#view-event-section').show();
      return true;
    });

    // for when someone wants to go back and edit the event summary
    $('#view-event-edit-summary').on('click', () => {
      renderEventSummaryModal(newEvent = false); // fn null to keep prev. fn in place
    });

    // for when someone wants to add or modify event activities
    $('#view-event-add-activity').on('click', () => {
      renderEventActivityModal(newActivity = true, savFn = function(activity) {
        let data = getActivityModalVals({ idx: eventTableData.headers.length });
        eventTableData.headers.push({
          label: data.label,
          fn: (d) => { // on click function
            renderEventActivityModal(newActivity = false, savFn = function(activity) { // on save
              Object.assign(activity, getActivityModalVals());
              eventTableData.headers[data.idx].label = activity.label;
              refreshTable();
              return true;
            }, delFn = function(activity) { // on delete
              for(let i = d.idx + 1; i < eventTableData.headers.length; i++)
                eventTableData.headers[i].data.idx--;
              eventTableData.headers.splice(d.idx, 1);
              refreshTable();
              return true;
            }, d); // last param is to set modal defaults
          },
          data: data // on save activity
        });

        refreshTable();
        return true;
      }); // null activity is new activity
    });

    // for when someone wants to add or modify event windows
    $('#view-event-add-window').on('click', () => {
      $('#edit-window-modal').addClass('is-active');
    });

    // for when someone wants to add or modify event details
    $('#view-event-add-field').on('click', () => {
      $('#edit-detail-modal').addClass('is-active');
    });
  });

  // for when someone wants to log in or register
  $('#log-in-btn, #guest-auth-prompt-open-auth').on('click', () => {
    $('#guest-auth-prompt-modal').removeClass('is-active');
    $('#authentication-modal').addClass('is-active');
  });

  // for when someone's ready to publish their event
  $('#view-event-publish-event').on('click', () => {
    // TODO more processing here to see if the user is logged in, etc.
    $('#guest-auth-prompt-modal').addClass('is-active');
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
          console.log(`toggle ${elem}`);
          $(`.${elem}`).not('.toggle').toggle();
        }
      });
    }
  });

});

