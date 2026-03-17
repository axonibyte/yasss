export function showToast(message, type = 'is-info') {
  if (window.toast) {
    window.toast({
      message,
      type,
      duration: 5000,
      position: 'top-center',
      closeOnClick: true
    });
  }
}
