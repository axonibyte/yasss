$(function(){

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

  $('#create-event-btn').on('click', () => {
    $('#edit-event-modal').addClass('is-active');
  });

  // close any modal when their respective 'x' is clicked
  $('.modal .modal-close, .modal button.delete').on('click', function() {
    $(this).closest('.modal.is-active').removeClass('is-active');
  });

  // certain switches hide elements
  $('.toggle').on('click', function() {
    let elems = [];
    $(this).attr('class').split(/\s+/).forEach((elem) => {
      if(elem.startsWith('toggle-')) {
        console.log(elem);
        $(`.${elem}`).not('.toggle').toggle();
      }
    });
  });

});

