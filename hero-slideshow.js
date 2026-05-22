// hero-slideshow.js
// Lightweight CSS-fade hero background slideshow.
// Uses 4 WebP images from Firebase Storage — lazy-loaded after first paint.

(function () {

  var IMAGES = [
    'https://firebasestorage.googleapis.com/v0/b/st-francis-school-a3e7e.firebasestorage.app/o/hero%2Fhero1.webp?alt=media',
    'https://firebasestorage.googleapis.com/v0/b/st-francis-school-a3e7e.firebasestorage.app/o/hero%2Fhero2.webp?alt=media',
    'https://firebasestorage.googleapis.com/v0/b/st-francis-school-a3e7e.firebasestorage.app/o/hero%2Fhero3.webp?alt=media',
    'https://firebasestorage.googleapis.com/v0/b/st-francis-school-a3e7e.firebasestorage.app/o/hero%2Fhero4.webp?alt=media'
  ];

  var INTERVAL  = 5000;  // ms per slide
  var FADE_TIME = 1200;  // ms fade duration
  var current   = 0;
  var slides    = [];

  function buildSlides() {
    var hero = document.querySelector('.hero');
    if (!hero) return;

    // Inject slide CSS once
    if (!document.getElementById('hero-slide-style')) {
      var s = document.createElement('style');
      s.id = 'hero-slide-style';
      s.textContent =
        '.hero-slide{position:absolute;inset:0;background-size:cover;background-position:center;' +
        'opacity:0;transition:opacity ' + (FADE_TIME / 1000) + 's ease;z-index:0;will-change:opacity}' +
        '.hero-slide.active{opacity:1}' +
        '.hero-slide::after{content:"";position:absolute;inset:0;' +
        'background:linear-gradient(to bottom,rgba(0,0,0,.55) 0%,rgba(0,0,0,.35) 50%,rgba(0,0,0,.6) 100%)}';
      document.head.appendChild(s);
    }

    // Build a slide div per image
    IMAGES.forEach(function (url, i) {
      var div = document.createElement('div');
      div.className = 'hero-slide' + (i === 0 ? ' active' : '');
      // Lazy-load: set bg only when image is ready
      var img = new Image();
      img.onload = function () { div.style.backgroundImage = 'url(' + url + ')'; };
      img.src = url;
      hero.insertBefore(div, hero.firstChild);
      slides.push(div);
    });
  }

  function nextSlide() {
    slides[current].classList.remove('active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('active');
  }

  function init() {
    buildSlides();
    if (slides.length > 1) {
      setInterval(nextSlide, INTERVAL);
    }
  }

  // Run after page load so it never blocks first paint
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }

})();
