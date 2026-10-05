import React, { createContext, useContext, useState, useEffect } from 'react';

const PrivacyContext = createContext({
  isPrivate: false,
  togglePrivacy: () => {},
  setPrivacy: () => {},
});

export const usePrivacy = () => useContext(PrivacyContext);

const LOOSE_CURRENCY_REGEX = /[£$€]\s?-?[\d,]+(\.\d+)?/i;

export function PrivacyProvider({ children }) {
  const [isPrivate, setIsPrivate] = useState(() => {
    try {
      return localStorage.getItem('crm_privacy_mode') === 'true';
    } catch {
      return false;
    }
  });

  const togglePrivacy = () => {
    setIsPrivate((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('crm_privacy_mode', String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const setPrivacy = (val) => {
    setIsPrivate(val);
    try {
      localStorage.setItem('crm_privacy_mode', String(val));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    document.documentElement.classList.toggle('privacy-mode', isPrivate);

    const scanAndMarkCurrency = (root = document.body) => {
      if (!root) return;
      
      if (root.nodeType === Node.ELEMENT_NODE) {
        if (
          root.tagName === 'SCRIPT' ||
          root.tagName === 'STYLE' ||
          root.tagName === 'INPUT' ||
          root.tagName === 'TEXTAREA' ||
          root.classList.contains('no-privacy-mask')
        ) {
          return;
        }
      }

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim();
        if (text && LOOSE_CURRENCY_REGEX.test(text)) {
          const parent = node.parentElement;
          if (
            parent &&
            parent.tagName !== 'SCRIPT' &&
            parent.tagName !== 'STYLE' &&
            parent.tagName !== 'INPUT' &&
            parent.tagName !== 'TEXTAREA' &&
            !parent.classList.contains('no-privacy-mask')
          ) {
            parent.classList.add('privacy-currency-mask');
          }
        }
      }
    };

    scanAndMarkCurrency();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              scanAndMarkCurrency(node);
            } else if (
              node.nodeType === Node.TEXT_NODE &&
              LOOSE_CURRENCY_REGEX.test(node.textContent || '')
            ) {
              const parent = node.parentElement;
              if (
                parent &&
                parent.tagName !== 'SCRIPT' &&
                parent.tagName !== 'STYLE' &&
                parent.tagName !== 'INPUT' &&
                parent.tagName !== 'TEXTAREA' &&
                !parent.classList.contains('no-privacy-mask')
              ) {
                parent.classList.add('privacy-currency-mask');
              }
            }
          });
        } else if (mutation.type === 'characterData') {
          if (LOOSE_CURRENCY_REGEX.test(mutation.target.textContent || '')) {
            const parent = mutation.target.parentElement;
            if (
              parent &&
              parent.tagName !== 'SCRIPT' &&
              parent.tagName !== 'STYLE' &&
              parent.tagName !== 'INPUT' &&
              parent.tagName !== 'TEXTAREA' &&
              !parent.classList.contains('no-privacy-mask')
            ) {
              parent.classList.add('privacy-currency-mask');
            }
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [isPrivate]);

  return (
    <PrivacyContext.Provider value={{ isPrivate, togglePrivacy, setPrivacy }}>
      {children}
    </PrivacyContext.Provider>
  );
}
