/* show-password: a Show / Hide button inside every sign-in password box on the page.
 *
 * Michael, 2026-10-26 ("Show the password on all login screens"), the day Terry's password would not open
 * Noctis Aurora's /traffic: a password with $ and ! in it, typed on a phone, could not be read back before it
 * was sent. Every input[type=password][autocomplete=current-password] on the page — there at load or drawn
 * later — gets a button in its right edge that flips it between hidden and shown. Boxes for choosing a new
 * password (sign-up, reset) are left alone.
 *
 * For sign-in screens that are not traffic-kit's own /traffic page (that one carries the same button in its
 * template). Styles go through el.style, never a <style> element or a style attribute, so a page whose CSP has
 * no 'unsafe-inline' for styles still gets them; the button takes the box's own text color, so it reads on
 * whatever background the site gives it. A React page gets the button in its component instead — this moves
 * the input into a wrapper, which React does not expect.
 *
 * Source: ~/traffic-kit/extras/show-password.js. Sites carry a copy; change it here and copy it out.
 */
(() => {
  const SEL = 'input[type="password"][autocomplete="current-password"]';

  const add = (pw) => {
    if (pw.dataset.showPassword) return;
    pw.dataset.showPassword = '1';
    const cs = getComputedStyle(pw);
    const hadFocus = document.activeElement === pw;

    // an inline box keeps its line unless it filled it (a width:100% box needs a block around it to resolve)
    const parent = pw.parentElement, pcs = getComputedStyle(parent);
    const fills = pw.offsetWidth >= parent.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight) - 1;
    const wrap = document.createElement('span');
    wrap.style.position = 'relative';
    wrap.style.display = /^inline/.test(cs.display) && !fills ? 'inline-block' : 'block';
    pw.parentNode.insertBefore(wrap, pw);
    wrap.appendChild(pw);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Show';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    if (pw.id) btn.setAttribute('aria-controls', pw.id);
    Object.assign(btn.style, {
      position: 'absolute', width: 'auto', minWidth: '64px', margin: '0', padding: '0 .8rem',
      border: '0', borderRadius: '10px', background: 'transparent', boxShadow: 'none', color: cs.color,
      font: 'inherit', fontSize: '.88rem', fontWeight: '650', lineHeight: '1', letterSpacing: 'normal',
      textTransform: 'none', cursor: 'pointer', zIndex: '1',
    });
    wrap.appendChild(btn);

    // the button sits inside the box's own right edge and height, wherever the box sits in the wrapper
    // (its margins, and any width narrower than the wrapper, stay outside)
    const fit = () => {
      if (!pw.offsetHeight) return;
      btn.style.top = `${pw.offsetTop + 3}px`;
      btn.style.height = `${pw.offsetHeight - 6}px`;
      btn.style.right = `${wrap.clientWidth - (pw.offsetLeft + pw.offsetWidth) + 3}px`;
    };
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(pw);

    // room for the button, without the box growing past its container
    pw.style.boxSizing = 'border-box';
    if (parseFloat(cs.paddingRight) < 76) pw.style.paddingRight = '76px';

    btn.addEventListener('click', () => {
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-pressed', String(show));
      pw.focus();
    });
    // hidden again as the form is sent, so the browser offers to save it as a password
    pw.form?.addEventListener('submit', () => {
      if (pw.type !== 'password') { pw.type = 'password'; btn.textContent = 'Show'; btn.setAttribute('aria-pressed', 'false'); }
    }, true);

    if (hadFocus) pw.focus();
  };

  const scan = (node) => {
    if (node.matches?.(SEL)) add(node);
    node.querySelectorAll?.(SEL).forEach(add);
  };
  const start = () => {
    scan(document);
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n); })
      .observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
