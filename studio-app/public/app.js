// The only script on the site: ask "are you sure?" before a button marked data-confirm.
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-confirm]');
  if (button && !window.confirm(button.dataset.confirm)) event.preventDefault();
});
