// admin-menu.js

function toggleMenu(menuId) {
  const parent = event.currentTarget;
  const children = document.getElementById('menu-' + menuId);
  
  if (!parent || !children) return;
  
  const isExpanded = parent.classList.contains('expanded');
  
  if (isExpanded) {
    parent.classList.remove('expanded');
    children.classList.remove('open');
  } else {
    parent.classList.add('expanded');
    children.classList.add('open');
  }
}