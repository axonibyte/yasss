var captchaRequired = true;
var userData = null;

const maxTableCols = 5;

var eventTableData;
clearTable();

var eventChanges = {};

function clearTable() {
  eventTableData = {
    summary: {},
    activities: [],
    windows: [],
    slots: [],
    details: [],
    volunteers: [],
    currentVol: -1,
    step: 1,
    editing: false
  }
}

function addCell(
    parent,
    label,
    hint = '',
    aesthetics = 'is-outlined is-primary',
    fn = null,
    data = {},
    tblIdx = null) {

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

  if(hint) cell.attr('data-tooltip', hint);

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

function mkDetail(detail) {
  eventTableData.details.push(detail);
}

function mvDetail(from, to) {
  if(eventTableData.details.length <= from || eventTableData.details.length <= to)
    throw new 'detail idx out of bounds';
  if(from == to) return;
  eventTableData.details.splice(
    from < to ? to - 1 : to,
    0,
    eventTableData.details.splice(from, 1)[0]);
}

function rmDetail(target) {
  eventTableData.details.splice(target, 1);
}

function mkVolunteer(vol) {
  if(undefined === vol.rsvps)
    vol.rsvps = [];
  eventTableData.volunteers.push(vol);
}

function mvVolunteer(from, to) {
  if(eventTableData.volunteers.length <= from || eventTableData.details.length <= to)
    throw new 'volunteer idx out of bounds';
  if(from == to) return;
  eventTableData.volunteers.splice(
    from < to ? to - 1 : to,
    0,
    eventTableData.volunteers.splice(from, 1)[0]);
}

function rmVolunteer(target) {
  eventTableData.volunteers.splice(target, 1);
}

function renderEventTableMeta(title, description, editable) {
  $('#view-event-short-descr').text(title);
  $('#view-event-long-descr').text(description);
  if(editable) {
    $('#view-event-volunteer').hide();
    $('#view-event-details').show();
    $('#view-event-edit-summary').show();
  } else {
    $('#view-event-details').hide();
    $('#view-event-volunteer').show();
    $('#view-event-edit-summary').hide();
  }
  if(userData
      && userData.account
      && eventTableData.summary.admin
      && eventTableData.summary.admin == userData.account)
    $('#view-event-view-report').show();
  else $('#view-event-view-report').hide();
}

function renderEventTable(parent, step = 1) {
  eventTableData.step = step;
  let sz = eventTableData.activities.length;
  let cols = sz >= maxTableCols ? maxTableCols : (sz + 1);

  let grid = $('<div/>').addClass('grid');

  if(0 == sz && 0 == eventTableData.windows.length) {
    cols = 1;
    addCell(
      grid,
      'You haven\'t added any windows or activities to your event yet!',
      '',
      'is-warning');
  } else {
    console.log(`render ${cols}-column table at step ${step}`);
  
    let idx = 0;
    addCell(grid, '', '', ''); // this is the space in the top-left part of the grid
    console.log(eventTableData);
    
    for(let a = step - 1; a < cols + step - 2; ++a) {
      console.log(`add activity ${a} with label ${eventTableData.activities[a].label}`);
      addCell(
        grid,
        eventTableData.activities[a].label,
        eventTableData.activities[a].data.description,
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
        '',
        'is-primary',
        eventTableData.windows[w].fn,
        eventTableData.windows[w].data,
        ++idx);
      
      for(let s = w * sz + (step - 1); s < w * sz + (step - 2 + cols); ++s) {
        let slot = eventTableData.slots[s];
        let act = eventTableData.activities[slot.data.activity].data;

        let state = getCurrentRSVPState(slot.data);
            
        addCell(
          grid,
          !slot.data.slotEnabled
            ? 'Unavailable'
            : eventTableData.editing
            ? `${slot.data.rsvpCount} / ${slot.data.slotVolunteerCap}`
            : state.hasRSVP
            ? 'Booked'
            : state.atCapacity
            ? 'At Capacity'
            : 'Available',
          '',
          !slot.data.slotEnabled
            ? 'is-outlined is-light'
            : eventTableData.editing
            ? 'is-outlined is-primary'
            : state.hasRSVP
            ? 'is-outlined is-warning'
            : state.atCapacity
            ? 'is-outlined is-light'
            : 'is-outlined is-primary',
          slot.fn,
          slot.data,
          ++idx);
      }
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

function renderEventTableSlider(parent, step = 1, max = null) {
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

function renderFieldTable() {
  $('#view-event-details tr').not('.is-primary').remove();

  if(0 == eventTableData.details.length) {
    $('#view-event-details tbody').append(
      $('<tr/>').append(
        $('<td/>')
          .addClass('is-light is-warning has-text-centered is-size-7')
          .attr('colspan', 2)
          .text('You haven\'t specified any custom fields yet! :)')));
    $('#view-event-details table').removeClass('is-hoverable');
    return;
  }

  $('#view-event-details table').addClass('is-hoverable');
  
  for(let i = 0, detail; detail = eventTableData.details[i]; i++) {
    detail.data.tblIdx = i;
    
    switch(eventTableData.details[i].data.type) {
    case 'STRING':
      var type = 'Text';
      break;
    case 'BOOLEAN':
      var type = 'True/False';
      break;
    case 'INTEGER':
      var type = 'Whole Number';
      break;
    case 'EMAIL':
      var type = 'Email Address';
      break;
    case 'PHONE':
      var type = 'Phone Number';
      break;
    default:
      var type = 'INVALID';
      break;
    }

    let row = $('<tr/>')
        .append(
          $('<td/>').text(eventTableData.details[i].data.field))
        .append(
          $('<td/>').text(`${type}${eventTableData.details[i].data.required ? ' (required)' : ''}`));

    if('function' === typeof detail.fn)
      row.on('click', function() {
        detail.fn(detail.data);
      });

    $('#view-event-details tbody').append(row);
  }
}

function updateSelectedVol() {
  let idx = Number($('#view-event-volunteer option:selected').val());
  if(undefined === idx) {
    idx = -1;
  } else {
    let vol = eventTableData.volunteers[idx];
    console.log(vol);
  }
  eventTableData.currentVol = idx;
  let step = eventTableData.step;
  refreshTable(step);
}

function renderVolDropdown() {
  $('#view-event-volunteer select').unbind('change');
  $('#view-event-volunteer option').remove();
  if(!eventTableData.volunteers.length) {
    $('#view-event-chg-vol').hide();
    $('#view-event-volunteer select').prop('disabled', true);
    //$('#view-event-volunteer option').first().text('Add a volunteer!');
    $('#view-event-volunteer select').append(
      $('<option/>')
        .text('Add a volunteer!'));
  } else {
    $('#view-event-chg-vol').show();
    $('#view-event-volunteer select').prop('disabled', false);
    //$('#view-event-volunteer option').first().text('Select a volunteer...');
    //$('#view-event-volunteer option').not(':first').remove();
    for(let i = 0, vol; vol = eventTableData.volunteers[i]; i++)
      $('#view-event-volunteer select').append(
        $('<option/>')
          .val(i)
          .text(vol.name));
    $('#view-event-volunteer select').on('change', function() {
      updateSelectedVol();
    });
  }
}

function renderGuestAuthPrompt(visible, loginFn, proceedFn) {
  $('#guest-auth-prompt-modal .modal-card-body p').hide();
  $(`#guest-auth-prompt-modal ${visible}`).show();
  $('#guest-auth-prompt-open-auth').unbind('click');
  $('#guest-auth-prompt-open-auth').on('click', () => {
    $('#guest-auth-prompt-modal').removeClass('is-active');
    loginFn();
  });
  $('#guest-auth-prompt-proceed-nologin').unbind('click');
  $('#guest-auth-prompt-proceed-nologin').on('click', () => {
    $('#guest-auth-prompt-modal').removeClass('is-active');
    proceedFn();
  });
  $('#guest-auth-prompt-modal').addClass('is-active');
}

function renderEventSummaryModal(newEvent = true, savFn = null, summary = {
  title: '',
  description: '',
  notifyOnSignup: true,
  allowMultiuserSignups: false
}) {
  $('#edit-event-submit').unbind('click');

  $('#edit-event-short-descr').val(summary.title);
  $('#edit-event-long-descr').val(summary.description);
  $('#edit-event-notify-switch').prop('checked', summary.notifyOnSignup);
  $('#edit-event-multiuser-switch').prop('checked', summary.allowMultiuserSignups);

  if('function' === typeof savFn) {

    $('#edit-event-modal p.modal-card-title').text(
      newEvent ? 'Create an Event' : 'Update an Event');
    
    $('#edit-event-submit').on('click', function() {
      if(savFn(summary))
        $('#edit-event-modal').removeClass('is-active');
    });
    $('#edit-event-short-descr').attr('readonly', false);
    $('#edit-event-long-descr').attr('readonly', false);
    $('#edit-event-notify-switch').attr('disabled', false);
    $('#edit-event-notify-switch').parent().show();
    $('#edit-event-multiuser-switch').attr('disabled', false);
    $('#edit-event-multiuser-switch').parent().show();
    $('#edit-event-submit').show();
  } else {
    
    $('#edit-event-modal p.modal-card-title').text('View Event');
    
    $('#edit-event-short-descr').attr('readonly', true);
    $('#edit-event-long-descr').attr('readonly', true);
    $('#edit-event-notify-switch').attr('disabled', true);
    $('#edit-event-notify-switch').parent().hide();
    $('#edit-event-multiuser-switch').attr('disabled', true);
    $('#edit-event-multiuser-switch').parent().hide();
    $('#edit-event-submit').hide();
  }

  $('#edit-event-modal').addClass('is-active');  
}

function renderEventActivityModal(newActivity = true, savFn = null, delFn = null, activity = {
  label: '',
  description: '',
  activityVolunteerCap: 0,
  slotVolunteerCapDefault: 0
}) {
  console.log(activity);

  $('#edit-activity-sav').unbind('click');
  $('#edit-activity-del').unbind('click');

  $('#edit-activity-short-descr').val(activity.label);
  $('#edit-activity-long-descr').val(activity.description);
  if(0 == activity.activityVolunteerCap) {
    $('#edit-activity-vol-cap-switch').prop('checked', true);
    $('#edit-activity-vol-cap-field').val('');
    $('.toggle-activity-vol-cap').not('.toggle').hide();
  } else {
    $('#edit-activity-vol-cap-switch').prop('checked', false);
    $('#edit-activity-vol-cap-field').val(activity.activityVolunteerCap);
    $('.toggle-activity-vol-cap').not('.toggle').show();
  }
  if(0 == activity.slotVolunteerCapDefault) {
    $('#edit-activity-slot-vol-cap-def-switch').prop('checked', true);
    $('#edit-activity-slot-vol-cap-def-field').val('');
    $('.toggle-slot-vol-def-cap').not('.toggle').hide();
  } else {
    $('#edit-activity-slot-vol-cap-def-switch').prop('checked', false);
    $('#edit-activity-slot-vol-cap-def-field').val(activity.slotVolunteerCapDefault);
    $('.toggle-slot-vol-def-cap').not('.toggle').show();
  }

  if('function' === typeof savFn) {

    $('#edit-activity-modal p.modal-card-title').text(
      newActivity ? 'Add an Activity' : 'Update an Activity');
    
    $('#edit-activity-sav').on('click', function() {
      if(savFn(activity))
        $('#edit-activity-modal').removeClass('is-active');
    }).show();

    $('#edit-activity-short-descr').attr('readonly', false);
    $('#edit-activity-long-descr').attr('readonly', false);
    $('#edit-activity-vol-cap-switch').prop('disabled', false);
    $('#edit-activity-vol-cap-field').prop('readonly', false);
    $('#edit-activity-vol-cap-def-switch').prop('disabled', false);
    $('#edit-activity-vol-cap-def-field').prop('readonly', false);
  
  } else {

    $('#edit-activity-modal p.modal-card-title').text('View Activity');

    $('#edit-activity-short-descr').attr('readonly', true);
    $('#edit-activity-long-descr').attr('readonly', true);
    $('#edit-activity-vol-cap-switch').prop('disabled', true);
    $('#edit-activity-vol-cap-field').prop('readonly', true);
    $('#edit-activity-slot-vol-cap-def-switch').prop('disabled', true);
    $('#edit-activity-slot-vol-cap-def-field').prop('readonly', true);
    
    $('#edit-activity-sav').hide();
  }

  if('function' === typeof delFn)
    $('#edit-activity-del').on('click', function() {
      if(delFn(activity))
        $('#edit-activity-modal').removeClass('is-active');
    }).show();
  else $('#edit-activity-del').hide();

  $('#edit-activity-modal').addClass('is-active');
}

function renderEventWindowModal(newWindow = true, savFn = null, delFn = null, win = {
  startDate: '',
  endDate: ''
}) {
  $('#edit-window-sav').unbind('click');
  $('#edit-window-del').unbind('click');

  $('#edit-window-modal p.modal-card-title').text(
      newWindow ? 'Add a Window' : 'Update a Window');

  $('#edit-window-control').empty().append(
    $('<input/>').addClass('input').attr('type', 'date').attr('id', 'edit-window-range')
  );
  
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  let calOpts = {
    displayMode: 'dialog',
    isRange: true,
    timeFormat: 'hh:mm a',
    type: 'datetime',
    validateLabel: 'Save',
    minDate: tomorrow
  };
  
  if(newWindow || '' == win.startDate || '' == win.startTime) {
    calOpts.startDate = new Date(tomorrow);
    calOpts.startTime = calOpts.startDate;
    calOpts.startTime.setHours(8, 0, 0, 0);
    calOpts.endDate = new Date(tomorrow);
    calOpts.endTime = calOpts.endDate;
    calOpts.endTime.setHours(17, 0, 0, 0);
  } else {
    calOpts.startDate = win.startDate;
    calOpts.startTime = win.startDate;
    calOpts.endDate = win.endDate;
    calOpts.endTime = win.endDate;
  }

  bulmaCalendar.attach('#edit-window-range', calOpts);

  if('function' === typeof savFn)
    $('#edit-window-sav').on('click', function() {
      if(savFn(win))
        $('#edit-window-modal').removeClass('is-active');
    }).show();
  else $('#edit-window-sav').hide();

  if('function' === typeof delFn)
    $('#edit-window-del').on('click', function() {
      if(delFn(win))
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
  $('#edit-detail-descr').val(detail.description);
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

function renderEventSlotModal(savFn = null, slot = {
  activity: -1,
  window: -1,
  slotEnabled: true,
  slotVolunteerCap: 0
}) {
  $('#edit-slot-sav').unbind('click');
  
  $('#edit-slot-activity-field').val(
    0 <= slot.activity
      ? eventTableData.activities[slot.activity].label
      : 'N/A');
  $('#edit-slot-window-field').val(
    0 <= slot.window
      ? fmtDateRange(
          eventTableData.windows[slot.window].data.startDate,
          eventTableData.windows[slot.window].data.endDate,
          true)
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

  if(0 == slot.slotVolunteerCap) {
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

function renderVolEditModal(newVol = true, savFn = null, delFn = null, vol = {
  name: '',
  details: []
}) {
  $('#edit-vol-sav').unbind('click');
  $('#edit-vol-del').unbind('click');

  $('#edit-vol-modal p.modal-card-title').text(
    newVol ? 'Add a Volunteer' : 'Update a Volunteer');

  $('#edit-vol-modal section.modal-card-body div.field').not(':first').remove();

  for(let d = 0, detail; detail = eventTableData.details[d]; d++) {
    let label = detail.data.field;
    if(detail.data.required) label += ' (required)';

    if('BOOLEAN' != detail.data.type)
      label += '&ensp;'
    
    let field = $('<div/>')
        .addClass('control')
        .append(
          $('<label/>')
            .addClass('label')
            .html(label));
    let tblIdx = detail.data.tblIdx;
    console.log(`detail type: ${detail.data.type} at tblIdx ${tblIdx}`);
    
    switch(detail.data.type) {
    case 'BOOLEAN':
      field
        .children('label')
        .attr('for', `vol-detail-${tblIdx}`)
        .addClass('switch');
      field
        .prepend(
          $('<input/>')
            .attr('id', `vol-detail-${tblIdx}`)
            .attr('type', 'checkbox')
            .addClass('switch is-rtl'));
      break;
      
    case 'STRING':
      field.append(
        $('<input/>')
          .attr('id', `vol-detail-${tblIdx}`)
          .attr('type', 'text')
          .attr('placeholder', detail.data.description)
          .addClass('input'));
      break;
      
    case 'INTEGER':
      field.append(
        $('<input/>')
          .attr('id', `vol-detail-${tblIdx}`)
          .attr('type', 'number')
          .attr('min', '0')
          .attr('placeholder', detail.data.description)
          .addClass('input integer-validation'));
      break;
      
    case 'EMAIL':
      field.append(
        $('<input/>')
          .attr('id', `vol-detail-${tblIdx}`)
          .attr('type', 'text')
          .attr('placeholder', detail.data.description)
          .addClass('input'));
      break;
      
    case 'PHONE':
      field.append(
        $('<input/>')
          .attr('id', `vol-detail-${tblIdx}`)
          .attr('type', 'text')
          .attr('placeholder', detail.data.description)
          .addClass('input'));
      break;
      
    default:
      continue;
    }

    $('#edit-vol-modal section.modal-card-body')
      .append(
        $('<div/>')
          .addClass('field')
          .append(field));

    if(undefined !== vol.details[tblIdx]) {
      console.log(`set #vol-detail-${tblIdx} to ${vol.details[tblIdx].value}`);
      if('BOOLEAN' == detail.data.type) {
        $(`#vol-detail-${tblIdx}`).prop('checked', vol.details[tblIdx].value);
      } else {
        $(`#vol-detail-${tblIdx}`).val(vol.details[tblIdx].value);
      }
    }
  }

  $('#vol-detail-name').val(vol.name);

  if('function' === typeof savFn)
    $('#edit-vol-sav').on('click', function() {
      if(savFn(vol))
        $('#edit-vol-modal').removeClass('is-active');
    }).show();
  else $('#edit-vol-sav').hide();

  if('function' === typeof delFn)
    $('#edit-vol-del').on('click', function() {
      if(delFn(vol))
        $('#edit-vol-modal').removeClass('is-active');
    }).show();
  else $('#edit-vol-del').hide();

  $('#edit-vol-modal').addClass('is-active');
}

function refreshTable(step = 1) {
  renderEventTable($('#view-event-table'));
  renderEventTableSlider($('#view-event-table').parent(), step);
  renderFieldTable();
}

function fmtDateRange(begin, end, oneLiner = false) {
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
  return oneLiner
    ? `${beginStr} - ${endStr}`
    : `Begin: ${beginStr}<br />End: ${endStr}`;
}

const emailRegex = /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/;
const intRegex = /\d+(\.\d{0,9})?/;
const phoneRegex = /(\+?( |-|\.)?\d{1,2}( |-|\.)?)?(\(?\d{3}\)?|\d{3})( |-|\.)?(\d{3}( |-|\.)?\d{4})/;

function validateSummaryModal() {
  let data = {
    title: $('#edit-event-short-descr').val().trim(),
    description: $('#edit-event-long-descr').val().trim(),
    notifyOnSignup: $('#edit-event-notify-switch').prop('checked'),
    allowMultiuserSignups: $('#edit-event-multiuser-switch').prop('checked')
  };

  try {
    if('' === data.title)
      throw 'The title of your event cannot be blank.';
  } catch(e) {
    console.error(e);
    toast({ message: e, type: 'is-danger' });
    return null;
  }
  
  return data;
}

function validateActivityModal(newVals = null) {
  let avcChecked = $('#edit-activity-vol-cap-switch').prop('checked');
  let svcdChecked = $('#edit-activity-slot-vol-cap-def-switch').prop('checked');
  
  let data = {
    label: $('#edit-activity-short-descr').val().trim(),
    description: $('#edit-activity-long-descr').val().trim(),
    activityVolunteerCap: avcChecked
      ? 0 : Number($('#edit-activity-vol-cap-field').val()),
    slotVolunteerCapDefault: svcdChecked
      ? 0 : Number($('#edit-activity-slot-vol-cap-def-field').val())
  }

  try {
    if('' == data.label)
      throw 'The label for your activity cannot be blank.';

    if(
      !avcChecked && (
        !Number.isInteger(data.activityVolunteerCap)
          || 1 > data.activityVolunteerCap
          || 255 < data.activityVolunteerCap))
      throw 'The activity volunteer cap needs to be number between 1 and 255';
       
    if(
      !svcdChecked && (
        !Number.isInteger(data.slotVolunteerCapDefault)
          || 1 > data.slotVolunteerCapDefault
          || 255 < data.slotVolunteerCapDefault))
      throw 'The default slot volunteer cap needs to be a number between 1 and 255.';

  } catch(e) {
    console.error(e);
    toast({ message: e, type: 'is-danger' });
    return null;
  }
  
  return null != newVals ? Object.assign(data, newVals) : data;
}

function validateWindowModal(newVals = null) {
  let cal = $('#edit-window-range')[0].bulmaCalendar;
  let data = {
    startDate: cal.startDate,
    endDate: cal.endDate
  }

  try {
    if(!cal.startDate || !cal.endDate)
      throw 'Please specify the entire window range.';
  } catch(e) {
    console.error(e);
    toast({ message: e, type: 'is-danger' });
    return null;
  }
  
  return null != newVals ? Object.assign(data, newVals) : data;
}

function validateSlotModal(newVals = null) {
  let eseChecked = $('#edit-slot-enable-switch').prop('checked');
  let esvcChecked = $('#edit-slot-vol-cap-switch').prop('checked');
  
  let data = {
    slotEnabled: eseChecked,
    slotVolunteerCap: esvcChecked
      ? 0
      : Number($('#edit-slot-vol-cap-field').val())
  }

  try {
    if(
      eseChecked && !esvcChecked && (
        !Number.isInteger(data.slotVolunteerCap)
          || 1 > data.slotVolunteerCap
          || 255 < data.slotVolunteerCap))
      throw 'The volunteer cap needs to be a number between 1 and 255.';
  } catch(e) {
    console.error(e);
    toast({ message: e, type: 'is-danger' });
    return null;
  }
  
  return null != newVals ? Object.assign(data, newVals) : data;
}

function validateFieldModal(newVals = null) {
  let data = {
    type: $('#edit-detail-type-dropdown option:selected').val(),
    field: $('#edit-detail-field').val().trim(),
    description: $('#edit-detail-descr').val().trim(),
    required: $('#edit-detail-required-switch').prop('checked')
  }

  try {
    if(data.type.includes('?'))
      throw 'Please make sure to select a detail type.';
    if('' === data.field)
      throw 'The field label can\'t be empty.';
  } catch(e) {
    console.error(e);
    toast({ message: e, type: 'is-danger' });
    return null;
  }
  
  return null != newVals ? Object.assign(data, newVals) : data;
}

function setErrorTag(input, hint) {
  if(null === hint) {
    input.removeClass('is-danger');
    input.siblings('label').find('.tag').remove();
  } else {
    input.addClass('is-danger');
    input.siblings('label').append(
      $('<button/>')
        .addClass('tag is-danger has-tooltip-right')
        .attr('data-tooltip', hint)
        .text('Error'));
  }
}

function validateVolEditModal(newVals = null) {
  let deetVals = new Array(eventTableData.details.length).fill(undefined);

  $('#edit-vol-modal').find('.tag').remove();
  $('#edit-vol-modal').find('.is-danger').removeClass('is-danger');

  var invalid = 0;

  try {
    var name = $('#vol-detail-name').val().trim();
    if('' === name) {
      setErrorTag($('#vol-detail-name'), 'Please provide a name.');
      invalid++;
    }
    
    $('#edit-vol-modal').find('input').not('#vol-detail-name').each(function() {
      let idx = Number($(this).attr('id').substr(11));
      let detail = eventTableData.details[idx];
      console.log(`elem: ${$(this).attr('id')} = ${$(this).val()}`);
      console.log(detail.data);
      
      if('BOOLEAN' == eventTableData.details[idx].data.type)
        var deetVal = $(this).is(':checked');
      else
        var deetVal = $(this).val().trim();
      
      switch(eventTableData.details[idx].data.type) {
      case 'INTEGER':
        if('' !== deetVal && !intRegex.test(deetVal)) {
          setErrorTag($(this), 'This needs to be an integer.');
          invalid++;
        }
        break;
      case 'EMAIL':
        if('' !== deetVal && !emailRegex.test(deetVal)) {
          setErrorTag($(this), 'This needs to be an email address.');
          invalid++;
        }
        break;
      case 'PHONE':
        if('' !== deetVal && !phoneRegex.test(deetVal)) {
          setErrorTag($(this), 'This needs to be a phone number.');
          invalid++;
        }
        break;
      default:
      }

      deetVals[idx] = {
        detail: detail.data.id,
        value: deetVal
      };
    });

    for(let i = 0; i < deetVals.length; i++) {
      if('' === deetVals[i].value && eventTableData.details[i].data.required) {
        setErrorTag($(`#vol-detail-${i}`), 'This field is required.');
        invalid++;
      }
    }
    
  } catch(e) {
    console.error(e);
    return null;
  }

  if(invalid) {
    let s = 1 === invalid ? '' : 's';
    toast({
      message: `${invalid} field${s} must be updated to meet requirements.`,
      type: 'is-danger'
    });
    return null;
  }

  let data = {
    name: name,
    remindersEnabled: false,
    details: deetVals
  }

  if(userData && userData.account)
    data.user = userData.account;

  return data;
}

function setLoaderBtn(parent, loading) {
  let modifiers = parent
      .attr('class')
      .split(/\s+/)
      .filter(
        elem => elem.startsWith('is-') && ['primary link info success warning danger']
          .some(e => elem.endsWith(e)))
  
  if(loading) {
    modifiers.forEach(
      m => parent.addClass(
        m.replace('is-', 'has-text-')));
    parent.addClass('is-loading');
  } else {
    modifiers.forEach(
      m => parent.removeClass(
        m.replace('is-', 'has-text-')));
    parent.removeClass('is-loading');
  }
}

function resetAuthModal() {
  $('#auth-modal-email').val('');
  $('#auth-modal-password').val('');
  $('#auth-modal-confirm-pass').val('');
}

function retrieveUserOwnedEvents(uId, andThen) {
  if(!userData || !userData.account) return;

  $.ajax(injectAuth({
    url: '/v1/events',
    type: 'GET',
    data: {
      admin: userData.account
    },
    success: function(res) {
      userData.ownedEvents = [];
      for(let i = 0, event; event = res.events[i]; i++)
        userData.ownedEvents.push(event.id);
      console.log(`user ${userData.account} owns events ${JSON.stringify(userData.ownedEvents)}`);
    },
    complete: function(res) {
      if('function' === typeof andThen) andThen();
    }
  })).fail(function(data) {
    console.error(data);
  });
}

function registerUser() {
  let userEmail = $('#auth-modal-email').val().trim();
  let userPass = $('#auth-modal-password').val();

  try {
    if(!emailRegex.test(userEmail))
      throw 'Please specify a valid email address.';
    if(0 == userPass.length)
      throw 'Your password should be at least one character in length';
    if(userPass !== $('#auth-modal-confirm-pass').val())
      throw 'Oops! You might have mistyped your password confirmation.';

    renderCAPTCHA((captchaRes) => {
      setLoaderBtn($('#auth-modal-register-btn'), true);
      
      (async () => {
        let sigReq = await genCreds(userEmail, userPass, '', '');
        console.log(sigReq);
        
        $.ajax({
          url: '/v1/users',
          type: 'POST',
          data: JSON.stringify({
            email: userEmail,
            pubkey: sigReq.pubkey,
            generateMFA: false
          }),
          dataType: 'json',
          headers: {
            'X-CAPTCHA-TOKEN': captchaRes
          }
        }).done(function(data) {
          console.log(data);
          toast({
            message: 'Your new account was successfully created :)',
            type: 'is-success'
          });
          $('#authentication-modal').removeClass('is-active');
        }).fail(function(data) {
          console.error(data);
          toast({
            message: `We ran into an issue creating your account: "${data.responseJSON.info}"`,
            type: 'is-danger'
          });
        }).always(function(data) {
          setLoaderBtn($('#auth-modal-register-btn'), false);
        });
      })();
    });
    
  } catch(e) {
    console.log(e);
    toast({ message: e, type: 'is-danger' });
    setLoaderBtn($('#auth-modal-register-btn'), false);
  }
}

function injectAuth(options, session = null, captcha = null) {
  if(null == session && userData && userData.session)
    session = userData.session;

  let headers = {};

  if(null != session)
    headers['Authorization'] = `AXB-SIG-REQ ${session}`;

  if(null != captcha)
    headers['X-CAPTCHA-TOKEN'] = captcha;

  if(options.headers)
    Object.assign(options.headers, headers);
  else options.headers = headers;

  console.log(`options are ${JSON.stringify(options)}`);
  return options;
}

function saveSession(res, onSuccess = null, onFailure = null) {
  let userSession = res.getResponseHeader('axb-session');
  
  if(userData) {
    if(userSession) {
      userData.session = userSession;
      $('#login-nav').hide();
      $('#logout-nav').show();
    } else {
      $('#logout-nav').hide();
      $('#login-nav').show();
      toast({
        message: 'Your user session was lost! Please log in again.',
        type: 'is-danger'
      });
      userData = null;
      Cookies.remove('user');
    }
  }

  if('function' === typeof onSuccess) {
    console.log(res);
    if('ok' == res.responseJSON.status)
      onSuccess(res);
    else if('function' !== typeof onFailure) toast({
      message: `Couldn't do what you asked, sorry. Error: ${res.responseJSON.info}`,
      type: 'is-danger'
    });
  }

  if('ok' != res.responseJSON.status && 'function' === typeof onFailure)
    onFailure(res);
}

function userLogin() {
  let userEmail = $('#auth-modal-email').val().trim();
  let userPass = $('#auth-modal-password').val();

  setLoaderBtn($('#auth-modal-login-btn'), true);

  try {
    if(!emailRegex.test(userEmail))
      throw 'Please specify a valid email address.';

    (async () => {
      let sigReq = await genCreds(userEmail, userPass, '', '');

      $.ajax({
        url: '/v1',
        type: 'GET',
        headers: {
          'Authorization': `AXB-SIG-REQ ${sigReq.payload}`
        },
        complete: function(res) {
          let userAccount = res.getResponseHeader('axb-account');
          let userSession = res.getResponseHeader('axb-session');
          if(userAccount && userSession) {
            $('#login-nav').hide();
            $('#logout-nav').show();
            userData = {
              account: userAccount,
              session: userSession
            };
            Cookies.set('user', JSON.stringify(userData));
            toast({
              message: 'Logged in!',
              type: 'is-success'
            });
            $('#authentication-modal').removeClass('is-active');

            retrieveUserOwnedEvents(userAccount, () => {
              if(eventTableData.summary.id)
                retrieveEvent(eventTableData.summary.id);
            });
            
          } else {
            toast({
              message: 'Invalid credentials. Try again?',
              type: 'is-danger'
            });
          }
        }
      }).fail(function(data) {
        console.error(data);
        toast({
          message: `Failed to log in: "${data.responseJSON.info}"`,
          type: 'is-danger'
        });
        $('#authentication-modal').removeClass('is-active');
      }).always(function(data) {
        setLoaderBtn($('#auth-modal-login-btn'), false);
      });
      
    })();
  
  } catch(e) {
    console.log(e);
    toast({ message: e, type: 'is-danger' });
    setLoaderBtn($('#auth-modal-login-btn'), false);
  }
}

function userLogout() {
  userData = null;
  if(eventTableData.summary.id)
    retrieveEvent(eventTableData.summary.id);
  Cookies.remove('user');
  toast({
    message: 'You\'ve been logged out!',
    type: 'is-warning'
  });
  $('#logout-nav').hide();
  $('#login-nav').show();
}

function refreshUserSession(session = null, fn = null) {
  if(null != userData && null != userData.session) {
    $.ajax(injectAuth({
      url: '/v1',
      type: 'GET',
      complete: res => saveSession(res, fn, fn)
    }, session)).done(function(data) {
      console.log('Refreshed user session.');
      Cookies.set('user', JSON.stringify(userData));
    }).fail(function(data) {
      // this only fires if the API can't be reached
      // if the API was successfully hit but the session is invalid,
      // then saveSession() handles the failure
      Cookies.remove('user');
      console.error('Failed to refresh user session.');
      console.error(data);
      $('#logout-nav').hide();
      $('#login-nav').show();
      toast({
        message: 'Your user session was lost! Please log in again.',
        type: 'is-danger'
      });
      userData = null;
    });
  } else if('function' === typeof fn) fn();

  setTimeout(refreshUserSession, 1000 * 60 * 10); // TODO make configurable
}

function onPubdActivityClick(d) {
  if(!eventTableData.editing) return;
  console.log('editing an activity');

  renderEventActivityModal(newActivity = false, savFn = function(activity) { // on save
    let a = validateActivityModal({ idx: activity.idx });
    if(null === a) return false;

    pubActivityUpdate(a);
    return true;
    
  }, delFn = function(activity) { // on delete
    pubActivityDeletion(activity.idx);
    return true;
  }, d);
}

function onPubdWindowClick(d) {
  if(!eventTableData.editing) return;
  console.log('editing a window');

  renderEventWindowModal(newWindow = false, savFn = function(window) { // on save
    let w = validateWindowModal({ idx: window.idx });
    if(null === w) return false;

    pubWindowUpdate(w);
    return true;
    
  }, delFn = function(window) { // on delete
    pubWindowDeletion(window.idx);
    return true;
  }, d);
  
  console.log(d);
}

function getCurrentRSVPState(slot) {
  return {
    hasRSVP: -1 < eventTableData.currentVol
      && -1 != eventTableData.volunteers[eventTableData.currentVol].rsvps.findIndex(
        elem => elem.activity == slot.activity
          && elem.window == slot.window
      ),
    atCapacity: 0 != slot.slotVolunteerCap
      && slot.rsvpCount >= slot.slotVolunteerCap
      || 0 != eventTableData.activities[slot.activity].data.activityVolunteerCap
      && eventTableData.slots.filter(
        s => s.data.activity == slot.activity
      ).map(
        s => s.data.rsvpCount
      ).reduce(
        (a, b) => a + b
      ) >= eventTableData.activities[slot.activity].data.activityVolunteerCap,
    count: slot.rsvpCount
  }
}

function onPubdSlotClick(d) {
  let rsvpState = getCurrentRSVPState(d);
  
  if(eventTableData.editing) {
    console.log('editing a slot');

    renderEventSlotModal(function(slot) {
      let s = validateSlotModal({
        activity: slot.activity,
        window: slot.window
      });
      if(null == s) return false;

      pubSlotUpdate(s);
      return true;
      
    }, d);
    
  } else if(
    eventTableData.volunteers.length
      && d.slotEnabled
      && (rsvpState.hasRSVP || !rsvpState.atCapacity)) {
    
    console.log('(un)volunteering for a slot');
    console.log(d);
    let vol = eventTableData.volunteers[eventTableData.currentVol];
    let idx = vol.rsvps.findIndex(elem => elem.activity == d.activity && elem.window == d.window);
    
    if(-1 != idx) {
      let actId = eventTableData.activities[vol.rsvps[idx].activity].data.id;
      let winId = eventTableData.windows[vol.rsvps[idx].window].data.id;
      
      let delFn = () => {
        eventTableData.slots.filter(
          s => s.data.activity == eventTableData.activities.map(
            a => a.data.id
          ).indexOf(actId)
            && s.data.window == eventTableData.windows.map(
              w => w.data.id
            ).indexOf(winId)
        ).forEach(
          s => {
            s.data.rsvps.splice(
              s.data.rsvps.indexOf(vol.id),
              1
            );
            s.data.rsvpCount--;
          }
        );

        vol.rsvps.splice(idx, 1);
        updateSelectedVol();
      };
      
      if(vol.id)
        pubRSVPDeletion(actId, winId, vol.id, delFn);
      else delFn();
      
    } else {
      let actId = eventTableData.activities[d.activity].data.id;
      let winId = eventTableData.windows[d.window].data.id;
      
      let mkFn = () => {
        eventTableData.slots.filter(
          s => s.data.activity == eventTableData.activities.map(
            a => a.data.id
          ).indexOf(actId)
            && s.data.window == eventTableData.windows.map(
              w => w.data.id
            ).indexOf(winId)
            && -1 == s.data.rsvps.indexOf(vol.id)
        ).forEach(
          s => {
            if(vol.id)
              s.data.rsvps.push(vol.id);
            s.data.rsvpCount++;
          }
        );
        
        vol.rsvps.push({
          activity: d.activity,
          window: d.window
        });
        updateSelectedVol();
      };
      
      if(vol.id)
        pubRSVPCreation(actId, winId, vol.id, mkFn);
      else mkFn();
    }
  }
  
  console.log(d);
}

function onPubdDetailClick(d) {
  if(!eventTableData.editing) return;
  console.log('editing a detail');

  renderEventDetailModal(false, function(detail) {
    let f = validateFieldModal({ tblIdx: detail.tblIdx });
    if(null == f) return false;

    pubDetailUpdate(f);
    return true;
    
  }, function(detail) {
    pubDetailDeletion(detail.tblIdx);
    return true;
  }, d);
  
  console.log(d);
}

function pubEventCreation(captchaRes = null) {
  console.log('publishing new event probably');

  eventData = {
    activities: [],
    windows: [],
    details: []
  };
  
  if(userData && userData.account)
    eventData.admin = userData.account;
  eventData.shortDescription = eventTableData.summary.title;
  eventData.longDescription = eventTableData.summary.description;
  eventData.allowMultiUserSignups = eventTableData.summary.allowMultiuserSignups;
  eventData.emailOnSubmission = eventTableData.summary.notifyOnSignup;

  for(let i = 0, activity; activity = eventTableData.activities[i]; i++) {
    let activityObj = {
      shortDescription: activity.data.label,
      priority: i
    };
    if(activity.data.description)
      activityObj.longDescription = activity.data.description;
    if(0 < activity.data.activityVolunteerCap)
      activityObj.maxActivityVolunteers = activity.data.activityVolunteerCap;
    if(0 < activity.data.slotVolunteerCapDefault)
      activityObj.maxSlotVolunteersDefault = activity.data.slotVolunteerCapDefault;

    if(eventTableData.slots.length)
      activityObj.slots = [];
    
    for(let j = i, slot; slot = eventTableData.slots[j]; j += eventTableData.windows.length) {
      let slotObj = {
        enabled: slot.data.slotEnabled,
        window: slot.data.window
      };
      if(slot.data.slotEnabled)
        slotObj.maxSlotVolunteers = slot.data.slotVolunteerCap;
      activityObj.slots.push(slotObj);
    }

    eventData.activities.push(activityObj);
  }

  for(let i = 0, window; window = eventTableData.windows[i]; i++) {
    eventData.windows.push({
      beginTime: `${window.data.startDate.valueOf()}`,
      endTime: `${window.data.endDate.valueOf()}`
    });
  }

  for(let i = 0, detail; detail = eventTableData.details[i]; i++) {
    let detailObj = {
      type: detail.data.type,
      label: detail.data.field
    };
    if(detail.data.description)
      detailObj.hint = detail.data.description;
    if(detail.data.required)
      detailObj.required = detail.data.required;
    eventData.details.push(detailObj);
  }

  console.log(eventData);
  
  $.ajax(injectAuth({
    url: '/v1/events',
    type: 'POST',
    data: JSON.stringify(eventData),
    dataType: 'json',
    complete: res => saveSession(res)
  }, null, captchaRes)).done(function(data) {
    console.log(data);
    toast({ message: 'Successfully published event!', type: 'is-success' });

    if(userData && userData.account)
      retrieveUserOwnedEvents(userData.account);

    window.location.replace(`${window.location.origin}?event=${data.event.id}&share`);

  }).fail(function(data) {
    console.log(data);
    toast({ message: 'Couldn\'t create your event... sorry.', type: 'is-danger' });
  });
}

function pubEventSummaryUpdate(summary) {
  let changes = {};
  if(eventTableData.summary.admin !== summary.admin)
    changes.admin = summary.admin;
  if(eventTableData.summary.title !== summary.title)
    changes.shortDescription = summary.title;
  if(eventTableData.summary.description !== summary.description)
    changes.shortDescription = summary.description;
  if(eventTableData.summary.notifyOnSignup !== summary.notifyOnSignup)
    changes.emailOnSubmission = summary.notifyOnSignup;
  if(eventTableData.summary.allowMultiuserSignups !== summary.allowMultiuserSignups)
    changes.allowMultiUserSignups = summary.allowMultiuserSignups;

  console.log('changes:');
  console.log(changes);

  if(!Object.keys(changes).length) return;
  
  $.ajax(injectAuth({
    url: `/v1/events/${eventTableData.summary.id}`,
    type: 'PATCH',
    data: JSON.stringify(changes),
    dataType: 'json',
    complete: res => saveSession(res, r => {
      Object.assign(eventTableData.summary, summary);
      renderEventTableMeta(
        summary.title,
        summary.description,
        true);
      refreshTable();
      console.log(`event summary ${eventTableData.summary.id} updated`);
      console.log(r);
    })
  })).fail(function(data) {
    console.error(data);
  });
}

function pubActivityCreation(activity) {
  $.ajax(injectAuth({
    url: `/v1/events/${eventTableData.summary.id}/activities`,
    type: 'POST',
    data: JSON.stringify({
      shortDescription: activity.label,
      longDescription: activity.description,
      maxActivityVolunteers: activity.activityVolunteerCap,
      maxSlotVolunteersDefault: activity.slotVolunteerCapDefault,
      priority: eventTableData.activities.length
    }),
    dataType: 'json',
    complete: res => saveSession(res, r => {
      activity.id = res.responseJSON.activity.id;
      let slots = [];
      for(let i = 0; i < eventTableData.windows.length; i++) {
        slots.push({
          fn: onPubdSlotClick,
          data: {
            slotEnabled: false,
            slotVolunteerCap: 0
          }
        });
      }
      mkActivity({
        label: activity.label,
        fn: onPubdActivityClick,
        data: activity
      }, slots);
      refreshTable();
    })
  })).fail(function(data) {
    console.error(data);
  });
}

function pubActivityUpdate(activity) {
  console.log(activity);
  
  let current = eventTableData.activities[activity.idx].data;
  let changes = {};
  if(current.label !== activity.label)
    changes.shortDescription = activity.label;
  if(current.description !== activity.description)
    changes.longDescription = activity.description;
  if(current.activityVolunteerCap !== activity.activityVolunteerCap)
    changes.maxActivityVolunteers = activity.activityVolunteerCap;
  if(current.slotVolunteerCapDefault !== activity.slotVolunteerCapDefault)
    changes.slotVolunteerCapDefault = activity.slotVolunteerCapDefault;

  if(!Object.keys(changes).length) return;

  $.ajax(injectAuth({
    url: `/v1/events/${eventTableData.summary.id}/activities/${current.id}`,
    type: 'PATCH',
    data: JSON.stringify(changes),
    dataType: 'json',
    complete: res => saveSession(res, r => {
      Object.assign(current, activity);
      eventTableData.activities[activity.idx].label = activity.label;
      console.log(`activity ${current.id} updated`);
      console.log(r);
      refreshTable();
    })
  })).fail(function(data) {
    console.error(data);
  });
}

function pubActivityDeletion(aIdx) {
  let aId = eventTableData.activities[aIdx].data.id;
  $.ajax(injectAuth({
    url: `/v1/events/${eventTableData.summary.id}/activities/${aId}`,
    type: 'DELETE',
    complete: res => saveSession(res, r => {
      rmActivity(aIdx);
      console.log(`activity ${aId} deleted`);
      refreshTable();
    })
  })).fail(function(data) {
    console.error(data);
  });
}

function pubWindowCreation(win) {
  $.ajax(injectAuth({
    url: `/v1/events/${eventTableData.summary.id}/windows`,
    type: 'POST',
    data: JSON.stringify({
      beginTime: `${win.startDate.valueOf()}`,
      endTime: `${win.endDate.valueOf()}`
    }),
    dataType: 'json',
    complete: res => saveSession(res, r => {
      win.id = res.responseJSON.window.id;
      let slots = [];
      for(let i = 0; i < eventTableData.activities.length; i++) {
        slots.push({
          label: 'Unavailable',
          fn: onPubdSlotClick,
          data: {
            slotEnabled: false,
            slotVolunteerCap: 0
          }
        });
      }
      mkWindow({
        label: fmtDateRange(win.startDate, win.endDate),
        fn: onPubdWindowClick,
        data: win
      }, slots);
      refreshTable();
    })
  })).fail(function(data) {
    console.error(data);
  });
}

function pubWindowUpdate(win) {
  let current = eventTableData.windows[win.idx].data;
  let changes = {};
  if(current.startDate !== win.startDate)
    changes.beginTime = `${win.startDate.valueOf()}`;
  if(current.endDate !== win.endDate)
    changes.endTime = `${win.endDate.valueOf()}`;

  if(!Object.keys(changes).length) return;

  $.ajax(injectAuth({
    url: `/v1/events/${eventTableData.summary.id}/windows/${current.id}`,
    type: 'PATCH',
    data: JSON.stringify(changes),
    dataType: 'json',
    complete: res => saveSession(res, r => {
      Object.assign(current, win);
      eventTableData.windows[win.idx].label = fmtDateRange(win.startDate, win.endDate);
      console.log(`window ${current.id} updated`);
      console.log(r);
      refreshTable();
    })
  })).fail(function(data) {
    console.error(data);
  });
}

function pubWindowDeletion(wIdx) {
  let wId = eventTableData.windows[wIdx].data.id;
  $.ajax(injectAuth({
    url: `/v1/events/${eventTableData.summary.id}/windows/${wId}`,
    type: 'DELETE',
    complete: res => saveSession(res, r => {
      rmWindow(wIdx);
      console.log(`window ${wId} deleted`);
      refreshTable();
    })
  })).fail(function(data) {
    console.error(data);
  });
}

function pubSlotUpdate(slot) {
  let aId = eventTableData.activities[slot.activity].data.id;
  let wId = eventTableData.windows[slot.window].data.id;
  let current = eventTableData.slots[slot.window * eventTableData.activities.length + slot.activity];

  if(current.data.slotEnabled && !slot.slotEnabled) { // delete
    $.ajax(injectAuth({
      url: `/v1/events/${eventTableData.summary.id}/activities/${aId}/windows/${wId}`,
      type: 'DELETE',
      complete: res => saveSession(res, r => {
        Object.assign(current.data, slot);
        current.label = 'Unavailable';
        console.log(`deleted slot for activity ${aId}, window ${wId}`);
        console.log(r);
        refreshTable();
      })
    })).fail(function(data) {
      console.error(data);
    });
    
  } else if(slot.slotEnabled) { // update
    $.ajax(injectAuth({
      url: `/v1/events/${eventTableData.summary.id}/activities/${aId}/windows/${wId}`,
      type: `PUT`,
      data: JSON.stringify({
        maxSlotVolunteers: slot.slotVolunteerCap
      }),
      dataType: 'json',
      complete: res => saveSession(res, r => {
        Object.assign(current.data, slot);
        current.label = 'Available'; // TODO maybe change label if cap reached
        console.log(`updated slot for activity ${aId}, window ${wId}`);
        console.log(r);
        refreshTable();
      })
    })).fail(function(data) {
      console.error(data);
    });
  }
}

function pubDetailCreation(detail) {
  $.ajax(injectAuth({
    url: `/v1/events/${eventTableData.summary.id}/details`,
    type: 'POST',
    data: JSON.stringify({
      type: detail.type,
      label: detail.field,
      hint: detail.description,
      required: detail.required
    }),
    dataType: 'json',
    complete: res => saveSession(res, r => {
      detail.id = res.responseJSON.detail.id;
      mkDetail({
        data: detail,
        fn: onPubdDetailClick
      });
      renderFieldTable();
    })
  })).fail(function(data) {
    console.error(data);
  });
}

function pubDetailUpdate(detail) {
  console.log(`tbl idx is ${detail.tblIdx}`);
  let current = eventTableData.details[detail.tblIdx].data;
  let changes = {};
  if(current.type !== detail.type)
    changes.type = detail.type;
  if(current.field !== detail.field)
    changes.label = detail.field;
  if(current.description !== detail.description)
    changes.hint = detail.description;
  if(current.required !== detail.required)
    changes.required = detail.required;

  if(!Object.keys(changes).length) return;

  $.ajax(injectAuth({
    url: `/v1/events/${eventTableData.summary.id}/details/${current.id}`,
    type: 'PATCH',
    data: JSON.stringify(changes),
    dataType: 'json',
    complete: res => saveSession(res, r => {
      Object.assign(current, detail);
      console.log(`detail ${current.id} updated`);
      console.log(r);
      renderFieldTable();
    })
  })).fail(function(data) {
    console.error(data);
  });
}

function pubDetailDeletion(dIdx) {
  let dId = eventTableData.details[dIdx].data.id;
  $.ajax(injectAuth({
    url: `/v1/events/${eventTableData.summary.id}/details/${dId}`,
    type: 'DELETE',
    complete: res => saveSession(res, r => {
      rmDetail(dIdx);
      console.log(`detail ${dId} deleted`);
      renderFieldTable();
    })
  })).fail(function(data) {
    console.error(data);
  });
}

function pubVolCreation(vol, onComplete = null) {
  console.log('publishing new volunteer');
  console.log(vol);

  volObj = structuredClone(vol);
  for(let i = Object.keys(volObj.details).length - 1; i >= 0; i--) {
    let deet = volObj.details[i];
    if('string' != typeof deet.value) {
      deet.value = `${deet.value}`;
    } else if('' === deet.value) {
      volObj.details.splice(i, 1);
    }
  }
  if(volObj.rsvps) {
    for(let i = 0, rsvp; rsvp = volObj.rsvps[i]; i++) {
      if('number' === typeof rsvp.activity)
        rsvp.activity = eventTableData.activities[rsvp.activity].data.id;
      if('number' === typeof rsvp.window)
        rsvp.window = eventTableData.windows[rsvp.window].data.id;
    }
  }

  console.log(JSON.stringify(volObj));

  $.ajax(injectAuth({
    url: `/v1/events/${eventTableData.summary.id}/volunteers`,
    type: 'POST',
    data: JSON.stringify(volObj),
    dataType: 'json',
    complete: res => saveSession(res, r => {
      vol.id = res.responseJSON.volunteer.id;
      if('function' === typeof onComplete)
        onComplete();
    })
  })).fail(function(data) {
    console.error(data);
  });
}

function pubVolUpdate(vol) {
  console.log('publishing volunteer updates');
  console.log(vol);

  volObj = structuredClone(vol);
  for(let i = Object.keys(volObj.details).length - 1; i >= 0; i--) {
    let deet = volObj.details[i];
    if('string' != typeof deet.value) {
      deet.value = `${deet.value}`;
    } else if('' === deet.value) {
      volObj.details.splice(i, 1);
    }
    delete volObj.id;
    if(volObj.user) delete volObj.user;
  }

  console.log(JSON.stringify(volObj));

  $.ajax(injectAuth({
    url: `/v1/events/${eventTableData.summary.id}/volunteers/${vol.id}`,
    type: 'PATCH',
    data: JSON.stringify(volObj),
    dataType: 'json',
    complete: res => saveSession(res)
  })).fail(function(data) {
    console.error(data);
  });
}

function pubVolDeletion(vId) {
  $.ajax(injectAuth({
    url: `/v1/events/${eventTableData.summary.id}/volunteers/${vId}`,
    type: 'DELETE',
    complete: res => saveSession(res, r => {
      console.log(`volunteer ${vId} deleted`);
    })
  })).fail(function(data) {
    console.error(data);
  });
}

function pubRSVPCreation(activity, window, volunteer, fn = null) {
  console.log(`publishing rsvp for activity ${activity}, window ${window} on behalf of ${volunteer}`);

  $.ajax(injectAuth({
    url: `/v1/events/${eventTableData.summary.id}/activities/${activity}/windows/${window}/volunteers/${volunteer}`,
    type: 'PUT',
    complete: res => saveSession(res, () => {
      if('function' === typeof fn) fn();
    })
  })).fail(function(data) {
    console.error(data);
  });
}

function pubRSVPDeletion(activity, window, volunteer, fn = null) {
  console.log(`removing rsvp from activity ${activity}, window ${window} on behalf of ${volunteer}`);

  $.ajax(injectAuth({
    url: `/v1/events/${eventTableData.summary.id}/activities/${activity}/windows/${window}/volunteers/${volunteer}`,
    type: 'DELETE',
    complete: res => saveSession(res, () => {
      if('function' === typeof fn) fn();
    })
  })).fail(function(data) {
    console.error(data);
  });
}

function pubRSVPS(captchaRes = null) {
  $.ajax(injectAuth({
    url: `/v1`,
    type: 'GET',
    complete: res => saveSession(res, () => {
      for(let v = 0, vol; vol = eventTableData.volunteers[v]; v++) {
        if(!vol.id) pubVolCreation(vol);
      }
    })
  }, null, captchaRes));
}

function retrieveEvent(eventID, postHook = null) {
  console.log(`retrieving ${eventID} probably`);

  $.ajax(injectAuth({
    url: `/v1/events/${eventID}`,
    type: 'GET',
    complete: res => saveSession(res)
  })).done(function(data) {
    console.log('Successfully retrieved event data.');
    console.log(data);

    clearTable();

    eventTableData.summary = {
      id: data.event.id,
      title: data.event.shortDescription,
      description: data.event.longDescription,
      notifyOnSignup: data.event.emailOnSubmission,
      allowMultiuserSignups: data.event.allowMultiUserSignups,
      admin: data.event.admin
    }
    renderEventTableMeta(
      eventTableData.summary.title,
      eventTableData.summary.description,
      false);

    let wins = {};
    
    for(let w = 0, win; win = data.event.windows[w]; w++) {
      let startDate = new Date(win.begin);
      let endDate = new Date(win.end);
      wins[win.id] = w;
      mkWindow({
        label: fmtDateRange(startDate, endDate),
        fn: onPubdWindowClick,
        data: {
          id: win.id,
          startDate: startDate,
          endDate: endDate
        }
      }, []);
    }

    console.log(wins);

    for(let a = 0, act; act = data.event.activities[a]; a++) {
      let slots = new Array(Object.keys(wins).length).fill(undefined);
      for(let s = 0, slot; slot = act.slots[s]; s++) {
        console.log(`slot window = ${slot.window}`);
        console.log(`wins = ${wins[slot.window]}`);
        slots[wins[slot.window]] = {
          id: slot.id,
          slotEnabled: true,
          slotVolunteerCap: slot.maxSlotVolunteers,
          rsvpCount: slot.rsvpCount,
          rsvps: slot.rsvps ? slot.rsvps : []
        };
      }
      console.log(`slots no 1 len ${slots.length}`);
      console.log(slots);
      slots = slots.map((s) => {
        return {
          fn: onPubdSlotClick,
          data: undefined === s ? {
            slotEnabled: false,
            slotVolunteerCap: 0,
            rsvpCount: 0,
            rsvps: []
          } : s
        };
      });
      console.log(`slots no 2 len ${slots.length}`);
      console.log(slots);
      mkActivity({
        label: act.shortDescription,
        fn: onPubdActivityClick,
        data: {
          id: act.id,
          label: act.shortDescription,
          description: act.longDescription,
          activityVolunteerCap: act.maxActivityVolunteers,
          slotVolunteerCapDefault: act.maxSlotVolunteersDefault
        }
      }, slots);
    }

    for(let dt = 0, detail; detail = data.event.details[dt]; dt++) {
      mkDetail({
        data: {
          id: detail.id,
          type: detail.type,
          field: detail.label,
          description: detail.hint,
          required: detail.required
        },
        fn: onPubdDetailClick
      });
    }

    if(data.event.volunteers) {
      let deetIDs = eventTableData.details.map(detail => detail.data.id);
      for(let v = 0, vol; vol = data.event.volunteers[v]; v++) {
        vol.rsvps = eventTableData.slots.filter(
          slot => slot.data.rsvps.includes(vol.id)
        ).map(slot => {
          return {
            activity: slot.data.activity,
            window: slot.data.window
          }
        });
        deetIDs.filter(id => !vol.details.map(d => d.detail).includes(id)).forEach(id => {
          vol.details.push({
            detail: id,
            value: ''
          });
        });
        vol.details.sort((a, b) => deetIDs.indexOf(a.detail) - deetIDs.indexOf(b.detail));
        mkVolunteer(vol);
      }
      if(data.event.volunteers.length)
        eventTableData.currentVol = 0;
    }

    $('#view-event-edit-summary').unbind('click');
    $('#view-event-edit-summary').on('click', () => {
      renderEventSummaryModal(false, function(summary) {
        let s = validateSummaryModal({ id: summary.id });
        if(null === s) return false;
        pubEventSummaryUpdate(s);
        return true;
      }, eventTableData.summary);
    });

    $('#view-event-add-vol').unbind('click');
    $('#view-event-add-vol').on('click', () => {
      renderVolEditModal(true, function(vol) {
        let data = validateVolEditModal();

        if(null == data) return false;
        else if(!userData && !eventTableData.volunteers.length) {
          renderGuestAuthPrompt(
            '.guest-on-voladd',
            () => {
              resetAuthModal();
              $('#guest-auth-prompt-modal').removeClass('is-active');
              $('#authentication-modal').addClass('is-active');
              return true;
            },
            () => {
              $('#edit-vol-modal').removeClass('is-active');
              //pubVolCreation(data);
              mkVolunteer(data);
              renderVolDropdown();
              $('#view-event-volunteer select option').last().prop('selected', true);
              updateSelectedVol();
              return true;
            });
          
          return false;
        }

        //pubVolCreation(data);
        mkVolunteer(data);
        renderVolDropdown();
        $('#view-event-volunteer select option').last().prop('selected', true);
        updateSelectedVol();
        return true;
      });
    });

    $('#view-event-chg-vol').unbind('click');
    $('#view-event-chg-vol').on('click', () => {
      renderVolEditModal(false, function(vol) {
        let data = validateVolEditModal();
        if(null == data) return false;

        let volunteer = eventTableData.volunteers[eventTableData.currentVol];
        Object.assign(volunteer, data);

        if(volunteer.id) {
          if(volunteer.rsvps) {
            volunteer = structuredClone(volunteer);
            delete volunteer.rsvps;
          }
          pubVolUpdate(volunteer);
        }
        
        renderVolDropdown();
        updateSelectedVol();
        return true;
        
      }, function(vol) {
        if(vol.id)
          pubVolDeletion(vol.id);
        rmVolunteer(Number($('#view-event-volunteer option:selected').val()));
        renderVolDropdown();
        updateSelectedVol();
        return true;
        
      }, eventTableData.volunteers[eventTableData.currentVol]);
    });

    $('#view-event-save-rsvps').unbind('click');
    $('#view-event-save-rsvps').on('click', () => {
      renderCAPTCHA(pubRSVPS);
    });

    console.log(eventTableData);
    refreshTable();
    $('#announcements-section').hide();
    $('#view-event-section').show();
    $('#view-event-add-activity').unbind('click');
    $('#view-event-add-activity').hide();
    $('#view-event-add-window').unbind('click');
    $('#view-event-add-window').hide();
    $('#view-event-add-field').unbind('click');
    $('#view-event-add-field').hide();
    $('#view-event-publish-event').hide();

    if(userData
        && userData.account
        && eventTableData.summary.admin
        && eventTableData.summary.admin == userData.ccount)
      $('#view-event-modify-event').show();
    else $('#view-event-modify-event').hide();
    $('#view-event-modify-event').unbind('click');
    $('#view-event-modify-event').on('click', function() {
      eventTableData.editing = true;
      eventTableData.currentVol = -1;
      refreshTable(eventTableData.step);
      renderEventTableMeta(
        eventTableData.summary.title,
        eventTableData.summary.description,
        true);
      $('#view-event-modify-event').hide();
      $('#view-event-save-rsvps').hide();
      
      $('#view-event-add-activity').unbind('click');
      $('#view-event-add-activity').on('click', () => {
        renderEventActivityModal(true, function(activity) {
          let data = validateActivityModal({ idx: eventTableData.activities.length });
          if(null == data) return false;
          pubActivityCreation(data);
          return true;
        });
      });
      $('#view-event-add-activity').show();

      $('#view-event-add-window').unbind('click');
      $('#view-event-add-window').on('click', () => {
        renderEventWindowModal(true, function(activity) {
          let data = validateWindowModal({ idx: eventTableData.windows.length });
          if(null == data) return false;
          pubWindowCreation(data);
          return true;
        });
      });
      $('#view-event-add-window').show();

      $('#view-event-add-field').unbind('click');
      $('#view-event-add-field').on('click', () => {
        renderEventDetailModal(true, function(activity) {
          let data = validateFieldModal({ idx: eventTableData.details.length });
          if(null == data) return false;
          pubDetailCreation(data);
          return true;
        });
      });
      $('#view-event-add-field').show();
      
      $('#view-event-close-editor').show();
    });
    
    $('#view-event-close-editor').unbind('click');
    $('#view-event-close-editor').on('click', function() {
      eventTableData.editing = false;
      updateSelectedVol();
      refreshTable(eventTableData.step);
      renderEventTableMeta(
        eventTableData.summary.title,
        eventTableData.summary.description,
        false);
      $('#view-event-add-activity').hide();
      $('#view-event-add-window').hide();
      $('#view-event-add-field').hide();
      $('#view-event-close-editor').hide();
      $('#view-event-modify-event').show();
      $('#view-event-save-rsvps').show();
    });
    
    if(userData && userData.ownedEvents
        && userData.ownedEvents.includes(eventTableData.summary.id)) {
      if(eventTableData.editing) {
        $('#view-event-modify-event').hide();
        $('#view-event-close-editor').show();
      } else {
        $('#view-event-close-editor').hide();
        $('#view-event-modify-event').show();
      }
    }

    renderVolDropdown();

    if('function' === typeof postHook)
      postHook();
    
  }).fail(function(data) {
    console.error(data);
    toast({
      message: 'Failed to retrieve the event.',
      type: 'is-danger'
    });
  });
}

var captchaCallback = null;

function loadCAPTCHA() {
  $.ajax({
    url: '/v1',
    type: 'GET',
    complete: res => {
      if(!res.responseJSON.captcha) {
        console.log('CAPTCHA disabled')
        captchaRequired = false;
      } else {
        console.log(`CAPTCHA site key is ${res.responseJSON.captcha}`);
        grecaptcha.enterprise.render('captcha', {
          sitekey: res.responseJSON.captcha,
          callback: res => {
            $('#captcha-modal').removeClass('is-active');
            if('function' === typeof captchaCallback)
              captchaCallback(res);
            captchaCallback = null;
          }
        });
        console.log('CAPTCHA loaded');
      }
    }
  })
}

function renderCAPTCHA(callback = null) {
  if(!userData) {
    captchaCallback = callback;
    grecaptcha.enterprise.reset();
    $('#captcha-modal').addClass('is-active');
  } else callback();
}

function loadSite() {

  const urlParams = new URLSearchParams(window.location.search);

  if(urlParams.has('event') && urlParams.get('event')) {
    retrieveEvent(urlParams.get('event'), urlParams.has('share') ? () => {
      $('#share-event-url').val(`${window.location.origin}?event=${eventTableData.summary.id}`);
      $('#share-event-modal').addClass('is-active');
    } : null);
  }

  $('#share-event-copy').on('click', () => {
    navigator.clipboard.writeText($('#share-event-url').val());
    toast({ message: 'Copied!', type: 'is-success' });
  });
  
  const viewTableSliderObserver = new MutationObserver(function(mutationsList) {
    mutationsList.forEach(function(mutation) {
      if('characterData' === mutation.type || 'childList' === mutation.type) {
        console.log(`slider moved to ${viewTableSliderOutput.text()}`);
        renderEventTable($('#view-event-table'), Number(viewTableSliderOutput.text()));
      }
    });
  });

  viewTableSliderObserver.observe(
    viewTableSliderOutput[0],
    { childList: true, subtree: true, characterData: true }
  );

  // for when someone hits the 'create event' nav or hero button
  $('#create-event-nav,#create-event-cta').on('click', () => {

    $('#view-event-modify-event').unbind('click');
    $('#view-event-close-editor').unbind('click');
    
    renderEventSummaryModal(newEvent = true, savFn = function(summary) {
      let s = validateSummaryModal();
      if(null === s) return false;

      $('#announcements-section').hide();
      $('#view-event-volunteer').hide();
      clearTable();

      renderEventTableMeta(
        s.title,
        s.description,
        true);
      eventTableData.summary = s;
      refreshTable();
      $('#view-event-section').show();
      $('#view-event-modify-event').hide();
      $('#view-event-close-editor').hide();
      $('#view-event-save-rsvps').hide();
      $('#view-event-add-activity').show();
      $('#view-event-add-window').show();
      $('#view-event-add-field').show();
      $('#view-event-publish-event').show();
      $('#view-event-buttons').show();
      return true;
    });
    
    // for when someone wants to go back and edit the event summary
    $('#view-event-edit-summary').unbind('click');
    $('#view-event-edit-summary').on('click', () => {
      renderEventSummaryModal(newEvent = false, savFn = function(summary) {
        let s = validateSummaryModal();
        if(null === s) return false;
        
        renderEventTableMeta(
          s.title,
          s.description,
          true);
        eventTableData.summary = s;
        refreshTable();
        $('#view-event-section').show();
        return true;
      }, eventTableData.summary);
    });

    // for when someone wants to add or modify event activities
    $('#view-event-add-activity').unbind('click');
    $('#view-event-add-activity').on('click', () => {
      renderEventActivityModal(newActivity = true, savFn = function(activity) {

        let data = validateActivityModal({ idx: eventTableData.activities.length });
        if(null === data) return false;
        
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
              let a = validateActivityModal();
              if(null === a) return false;
              
              Object.assign(activity, a);
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
              renderEventSlotModal(saveFn = function(s) {
                let newSlotVals = validateSlotModal();
                if(null === newSlotVals) return false;
                
                Object.assign(s, newSlotVals);
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
    $('#view-event-add-window').unbind('click');
    $('#view-event-add-window').on('click', () => {
      renderEventWindowModal(newWindow = true, savFn = function(activity) {

        let data = validateWindowModal({ idx: eventTableData.windows.length });
        if(null === data) return false;
        
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
              let w = validateWindowModal();
              if(null === w) return false;
              
              Object.assign(window, w);
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
              renderEventSlotModal(saveFn = function(s) {
                let newSlotVals = validateSlotModal();
                if(null === newSlotVals) return false;
                
                Object.assign(s, newSlotVals);
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
    $('#view-event-add-field').unbind('click');
    $('#view-event-add-field').on('click', () => {
      renderEventDetailModal(newDetail = true, savFn = function(detail) {

        let data = validateFieldModal({ idx: eventTableData.details.length });
        if(null === data) return false;
        
        mkDetail({
          data: data,
          fn: (d) => {
            renderEventDetailModal(newDetail = false, saveFn = function(d) {
              let newFieldVals = validateFieldModal();
              if(null === newFieldVals) return false;
              
              Object.assign(d, newFieldVals);
              renderFieldTable();
              return true;
            }, delFn = function(d) {
              rmDetail(d.tblIdx);
              renderFieldTable();
              return true;
            }, d);
          }
        });

        renderFieldTable();
        return true;
      });
      
    });
  });

  // for when someone wants to log in or register
  $('#auth-modal-login-btn').on('click', () => {
    userLogin();
  });
  
  $('#auth-modal-register-btn').on('click', () => {
    registerUser();
  });

  $('#login-nav').on('click', () => {
    resetAuthModal();
    $('#guest-auth-prompt-modal').removeClass('is-active');
    $('#authentication-modal').addClass('is-active');
  });

  // for users that want to log out
  $('#logout-nav').on('click', userLogout);

  // for when someone's ready to publish their event
  $('#view-event-publish-event').on('click', () => {
    if(userData) renderCAPTCHA(pubEventCreation);
    else renderGuestAuthPrompt(
      '.guest-on-publish',
      () => {
        resetAuthModal();
        $('#guest-auth-prompt-modal').removeClass('is-active');
        $('#authentication-modal').addClass('is-active');
      },
      () => renderCAPTCHA(pubEventCreation)
    );
  });
  
  // close any modal when their respective 'x' is clicked
  $('.modal .modal-close, .modal button.delete').on('click', function() {
    $(this).closest('.modal.is-active').removeClass('is-active');
  });

  // certain switches hide elements
  $('.toggle').on('change', function(e) {
    let elems = [];
    $(this).attr('class').split(/\s+/).forEach((elem) => {
      if(elem.startsWith('toggle-')) {
        console.log(`toggle ${elem}`);
        $(`.${elem}`).not('.toggle').toggle();
      }
    });
  });

  // validate numeric fields on the fly
  $('.integer-validation').on('keyup focusout', function() {
    if($(this).attr('readonly')) return;
    
    let min = Number($(this).attr('min'));
    let max = Number($(this).attr('max'))
    let val = Number($(this).val());
    if(null !== val) {
      if(isNaN(val) || null !== min && val < min)
        $(this).val(null !== min ? min : 0);
      else if(null !== max && val > max)
        $(this).val(max);
    }
  });

  // report handling
  $('#view-event-view-report').on('click', function() {
    fetch(`/v1/events/${eventTableData.summary.id}/report`, {
      headers: {
        Authorization: `AXB-SIG-REQ ${userData.session}`
      }
    }).then(
      res => res.blob()
    ).then((blob) => {
      var _url = window.URL.createObjectURL(blob);
      window.open(_url, "_blank").focus();
    }).catch(err => {
      console.log(err);
    });
  });

  setTimeout(() => {
    $('.pageloader').removeClass('is-active');
  }, 1000);
}

$(function() {
  toast_setToast_Defaults({
    duration: 5000,
    position: 'top-center',
    closeOnClick: true,
  });

  try {
    let userCookie = JSON.parse(Cookies.get('user'));
    if(userCookie) userData = userCookie;
  } catch(e) {
    console.log('no auth cookie detected');
    $('#login-nav').show();
  }

  refreshUserSession(
    null == userData || null == userData.session ? null : userData.session,
    loadSite);
  
});
