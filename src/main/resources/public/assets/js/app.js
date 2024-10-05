const maxTableCols = 5;

var eventTableData = {
  "activities": [],
  "windows": [],
  "slots": [],
  "step": 1
};

var eventChanges = {};

function addCell(parent, label, aesthetics = 'is-outlined is-primary', fn = null, data = {}, tblIdx = null) {
  let cell = $('<div/>')
    .addClass('cell event-cell')
    .append(
        $('<ul/>')
          .addClass('block-list is-small is-centered')
          .addClass(aesthetics)
          .append(
              $('<li/>')
                .html(label)
          )
    );

  parent.append(cell);

  if(null != tblIdx)
    data.tblIdx = tblIdx;

  if('function' === typeof fn) {
    cell.on('click', function() {
      fn(data);
    });
  }
}

// add an activity and new slots to event data table
// note: slots len must match window arr len
function mkActivity(activity, slots) {
  if(slots.length != eventTableData.windows.length)
    throw 'slot arr len does not match window arr len';
  if(!activity.data) activity.data = {};
  activity.data.idx = eventTableData.activities.length;
  eventTableData.activities.push(activity);
  for(let i = 0, slot; slot = slots[i]; i++) {
    if(!slot.data) slot.data = {};
    slot.data.activity = activity.data.idx;
    slot.data.window = i;
    eventTableData.slots.splice((i + 1) * eventTableData.activities.length - 1, 0, slot);
  }
}

// move an activity and all associated slots from one col idx to another idx in event data table
// col idx 0 represents the slots under the first activity -- windows not counted
// note: from == to is a nop; from, to must be in bounds
function mvActivity(from, to) {
  if(eventTableData.activities.length <= from || eventTableData.activities.length <= to)
    throw new 'activity idx out of bounds';
  if(from == to) return;
  eventTableData.activities.splice(
    from < to ? to - 1 : to,
    0,
    eventTableData.activities.splice(from, 1)[0]);
  for(let i = 0; i < eventTableData.windows.length; i++) {
    eventTableData.slots.splice(
      i * eventTableData.activities.length + (from < to ? to - 1 : to),
      0,
      eventTableData.slots.splice(
        i * eventTableData.activities.length + from,
        1)[0]);
  }
  for(let i = 0, activity; activity = eventTableData.activities[i]; i++)
    activity.data.idx = i;
  for(let i = 0, slot; slot = eventTableData.slots[i]; i++)
    slot.data.activity = i % eventTableData.activities.length;
}

// delete an activity and all associated slots from event data table
// col idx 0 represents the slots under the first activity -- windows not counted
function rmActivity(target) {
  for(let i = eventTableData.slots.length - eventTableData.activities.length + target, slot; slot = eventTableData.slots[i]; i -= eventTableData.activities.length)
  //for(let i = target, slot; slot = eventTableData.slots[i]; i += eventTableData.activities.length) {
    eventTableData.slots.splice(i, 1);
  eventTableData.activities.splice(target, 1);
  for(let i = target, activity; activity = eventTableData.activities[i]; i++)
    activity.data.idx = i;
  for(let i = 0, slot; slot = eventTableData.slots[i]; i++)
    slot.data.activity = i % eventTableData.activities.length;
}


// add a window and new slots to event data table
// note: slots len must match activity arr len
function mkWindow(window, slots) {
  if(slots.length != eventTableData.activities.length)
    throw 'slot arr len does not match activity arr len';
  if(!window.data) window.data = {};
  window.data.idx = eventTableData.windows.length;
  eventTableData.windows.push(window);
  for(let i = 0, slot; slot = slots[i]; i++) {
    if(!slot.data) slot.data = {};
    slot.data.activity = i;
    slot.data.window = window.data.idx;
    eventTableData.slots.push(slot);
  }
}

// move a window and all associated slots from one row to another idx in event data table
// row idx 0 represents the slots associated with the first window -- activities not counted
// note: from == to is a nop; from, to must be in bounds
function mvWindow(from, to) {
  if(eventTableData.windows.length <= from || eventTableData.activities.length <= to)
    throw new 'window idx out of bounds';
  if(from == to) return;
  eventTableData.windows.splice(
    from < to ? to - 1 : to,
    0,
    eventTableData.windows.splice(from, 1)[0]);
  eventTableData.slots.splice(
    eventTableData.activities.length * (from < to ? to - 1 : to),
    0,
    ...eventTableData.slots.splice(
      eventTableData.activities.length * from,
      eventTableData.activities.length));
  for(let i = 0, window; window = eventTableData.windows[i]; i++)
    window.data.idx = i;
  for(let i = 0, slot; slot = eventTableData.slots[i]; i++)
    slot.data.window = Math.floor(i / eventTableData.activities.length);
}

// delete a window and all associated slots from event data table
// row idx 0 represents the slots associated with the first window -- activities not counted
function rmWindow(target) {
  eventTableData.slots.splice(
    eventTableData.activities.length * target,
    eventTableData.activities.length);
  eventTableData.windows.splice(target, 1);
  for(let i = target, window; window = eventTableData.windows[i]; i++)
    window.data.idx = i;
  for(let i = 0, slot; slot = eventTableData.slots[i]; i++)
    slot.data.window = Math.floor(i / eventTableData.activities.length);
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
  eventTableData.step = step;
  let sz = eventTableData.activities.length;
  let cols = sz >= maxTableCols ? maxTableCols : (sz + 1);

  console.log(`render ${cols}-column table at step ${step}`);

  let grid = $('<div/>').addClass('grid');
  let idx = 0;
  addCell(grid, '', ''); // this is the space in the top-left part of the grid
  console.log(eventTableData);

  for(let a = step - 1; a < cols + step - 2; ++a) {
    console.log(`add activity ${a} with label ${eventTableData.activities[a].label}`);
    addCell(
        grid,
        eventTableData.activities[a].label,
        'is-primary',
        eventTableData.activities[a].fn,
        eventTableData.activities[a].data,
        ++idx);
  }

  for(let w = 0; w < eventTableData.windows.length; ++w) {
    console.log(`add window ${w} with label ${eventTableData.windows[w].label}`);
    addCell(
      grid,
      eventTableData.windows[w].label,
      'is-primary',
      eventTableData.windows[w].fn,
      eventTableData.windows[w].data,
      ++idx);
    
    for(let s = w * sz + (step - 1); s < w * sz + (step - 2 + cols); ++s) {
      addCell(
        grid,
        eventTableData.slots[s].label,
        eventTableData.slots[s].data.slotEnabled
          ? 'is-outlined is-primary'
          : 'is-outlined is-light',
        eventTableData.slots[s].fn,
        eventTableData.slots[s].data,
        ++idx);
    }
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
  if(null == max) {
    ln = eventTableData.activities.length;
    max = ln > (maxTableCols - 2) ? ln - (maxTableCols - 2) : 1;
  }
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
  //startTime: '',
  endDate: ''
  //endTime: ''
}) {
  $('#edit-window-sav').unbind('click');
  $('#edit-window-del').unbind('click');

  $('#edit-window-modal p.modal-card-title').text(
      newWindow ? 'Add a Window' : 'Update a Window');

  let cal = $('#edit-window-range')[0].bulmaCalendar;
  //if('' == startDate || '' == startTime || '' == endDate || '' == endTime)
  if('' == window.startDate || '' == window.startTime)
    cal.clear();
  else {
    cal.startDate = window.startDate;
    //cal.startTime = window.startTime;
    cal.endDate = window.endDate;
    //cal.endTime = window.endTime;
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
  type: '',
  field: '',
  description: '',
  required: false
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
  activity: -1,
  window: -1,
  slotEnabled: true,
  slotVolunteerCap: -1
}) {
  $('#edit-slot-sav').unbind('click');
  
  $('#edit-slot-activity-field').val(
    0 <= slot.activity
      ? eventTableData.activities[slot.activity].label
      : 'N/A');
  $('#edit-slot-window-field').val(
    0 <= slot.window
      ? eventTableData.windows[slot.window].label
      : 'N/A');
  
  $('#edit-slot-activity-btn').unbind('click');
  if(0 <= slot.activity) {
    $('#edit-slot-activity-btn').on('click', () => {
      $('#edit-slot-modal').removeClass('is-active');
      console.log(`click on activity tbl idx ${eventTableData.activities[slot.activity].data.tblIdx}`);
      $('.event-cell')[eventTableData.activities[slot.activity].data.tblIdx].click();
    }).show();
  } else $('#edit-slot-activity-btn').hide();

  $('#edit-slot-window-btn').unbind('click');
  if(0 <= slot.window) {
    $('#edit-slot-window-btn').on('click', () => {
      $('#edit-slot-modal').removeClass('is-active');
      console.log(`click on window tbl idx ${eventTableData.windows[slot.window].data.tblIdx}`);
      $('.event-cell')[eventTableData.windows[slot.window].data.tblIdx].click();
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

function fmtDateRange(begin, end) {
  let options = {
    day: '2-digit',
    year: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  };
  let beginStr = begin.toLocaleDateString('en-us', options);
  let endStr = end.toLocaleDateString('en-us', options);
  return `Begin: ${beginStr}<br />End: ${endStr}`;
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

function getWindowModalVals(newVals = null) {
  let cal = $('#edit-window-range')[0].bulmaCalendar;
  let data = {
    startDate: cal.startDate,
    //startTime: '',
    endDate: cal.endDate
    //endTime: ''
  }
  return null != newVals ? Object.assign(data, newVals) : data;
}

function getSlotModalVals(newVals = null) {
  let data = {
    slotEnabled: $('#edit-slot-enable-switch').prop('checked'),
    slotVolunteerCap: $('#edit-slot-vol-cap-switch').prop('checked')
        ? -1 : $('#edit-slot-vol-cap-field').val()
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
    for(let activity = 1; activity <= 5; activity++)
      eventTableData.activities.push({
        label: `Activity #${activity}`,
        fn: (data) => {
          console.log(`Activity idx = ${data.tblIdx} clicked.`);
        }
      });
    for(let window = 0; window < 4; window++) {
      eventTableData.windows.push({
        label: `Window #${window + 1}`,
        fn: (data) => {
          console.log(`Window idx = ${data.tblIdx} clicked.`);
        }
      });
    }
    for(let row = 0; row < 4; row++) {
      for(let col = 0; col < 5; col++) {
        eventTableData.slots.push({
          label: `Slot #${row + 1}-${col + 1}`,
          fn: (data) => {
            console.log(`Slot idx = ${data.tblIdx} clicked.`);
          }
        });
      }
    }

    let newSlots = [];
    for(let window = 0; window < 4; window++) {
      newSlots.push({
        label: `New Slot #A${window}`,
        fn: (data) => {
          console.log(`New slot idx = ${data.tblIdx} clicked.`);
        }
      });
    }
    mkActivity({
      label: `New Activity`,
      fn: (data) => {
        console.log(`New activity idx = ${data.tblIdx} clicked.`);
      }
    }, newSlots);

    mvActivity(5, 2);
    rmActivity(1);

    newSlots = [];
    for(let activity = 0; activity < 5; activity++) {
      newSlots.push({
        label: `New Slot #W${activity}`,
        fn: (data) => {
          console.log(`New slot idx = ${data.tblIdx} clicked.`);
        }
      });
    }
    mkWindow({
      label: `New Window`,
      fn: (data) => {
        console.log(`New window idx = ${data.tblIdx} clicked.`);
      }
    }, newSlots);

    mvWindow(4, 2);
    rmWindow(3);
    
    refreshTable();
    $('#view-event-section').show();
  });

  // for when someone hits the 'create event' nav item
  $('#create-event-btn').on('click', () => {
    eventTableData = {
      "activities": [],
      "windows": [],
      "slots": [],
      "step": 1
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

        let data = getActivityModalVals({ idx: eventTableData.activities.length });
        let slots = [];
        for(let i = 0, window; window = eventTableData.windows[i]; ++i) {
          slots.push({
            activity: data.idx,
            window: i,
            slotEnabled: true,
            slotVolunteerCap: data.slotVolunteerCapDefault
          });
        }
        mkActivity({
          label: data.label,
          fn: (d) => { // on click function
            renderEventActivityModal(newActivity = false, savFn = function(activity) { // on save
              Object.assign(activity, getActivityModalVals());
              eventTableData.activities[data.idx].label = activity.label;
              refreshTable();
              return true;
            }, delFn = function(activity) { // on delete
              rmActivity(activity.idx);
              refreshTable();
              return true;
            }, d); // last param is to set modal defaults
          },
          data: data // on save activity
        }, slots.map((slot) => {
          return {
            label: 'Slot',
            fn: (d) => {
              renderEventSlotModal(newSlot = true, saveFn = function(s) {
                Object.assign(s, getSlotModalVals());
                //eventTableData.slots[s.window * eventTableData.activities.length + s.activity].label = 'Updated';
                refreshTable();
                return true;
              }, d);
            },
            data: slot
          };
        }));

        refreshTable();
        return true;
      }); // null activity is new activity
    });

    // for when someone wants to add or modify event windows
    $('#view-event-add-window').on('click', () => {
      renderEventWindowModal(newWindow = true, savFn = function(activity) {

        let data = getWindowModalVals({ idx: eventTableData.windows.length });
        let slots = [];
        for(let i = 0, activity; activity = eventTableData.activities[i]; ++i) {
          slots.push({
            activity: i,
            window: data.idx,
            slotEnabled: true,
            slotVolunteerCap: activity.slotVolunteerCapDefault
          });
        }
        mkWindow({
          label: fmtDateRange(data.startDate, data.endDate),
          fn: (d) => { // on click function
            renderEventWindowModal(newWindow = false, saveFn = function(window) { // on save
              Object.assign(window, getWindowModalVals());
              eventTableData.windows[data.idx].label = fmtDateRange(data.startDate, data.endDate);
              refreshTable();
              return true;
            }, delFn = function(window) { // on delete
              rmWindow(window.idx);
              refreshTable();
              return true;
            }, d);
          },
          data: data // on save window
        }, slots.map((slot) => {
          return {
            label: 'Slot',
            fn: (d) => {
              renderEventSlotModal(newSlot = true, saveFn = function(s) {
                Object.assign(s, getSlotModalVals());
                refreshTable();
                return true;
              }, d);
            },
            data: slot
          };
        }));
        
        refreshTable();
        return true;
      }); // null window is new window
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

