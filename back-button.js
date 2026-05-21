/* back-button.js
   Intercepts the Android hardware/gesture back button so it navigates
   within the app instead of exiting the PWA.
   Loaded as a defer script; wires up on the 'load' event (after all
   modules including app-logic.js have run and wrapped window.showPage). */

window.addEventListener('load', function () {
  if (typeof window.showPage !== 'function') return;

  var _sp = window.showPage;   // capture the final wrapped showPage
  var _busy = false;

  // Wrap showPage to push a history entry on every navigation
  window.showPage = function (name) {
    _sp(name);
    if (!_busy) {
      history.pushState({ sfPage: name }, '', '#' + name);
    }
  };

  // Push the initial home entry ON TOP of the existing history entry.
  // This gives Android a real back-stop — pressing back lands here
  // instead of leaving the app.
  history.pushState({ sfPage: 'home' }, '', '#home');

  // Handle hardware/gesture back (and forward)
  window.addEventListener('popstate', function (e) {
    var page = (e.state && e.state.sfPage) ? e.state.sfPage : 'home';
    _busy = true;
    _sp(page);           // call pre-wrap showPage (no extra pushState)
    _busy = false;
    // Re-anchor at home each time we pop back to it — ensures the user
    // can never swipe out of the app from the home screen.
    if (page === 'home') {
      history.pushState({ sfPage: 'home' }, '', '#home');
    }
  });
});
