(function () {
    function initPreferences() {
        if (!window.EditorCore) return;
        var theme = EditorCore.ThemeManager;
        var i18n = EditorCore.I18n;
        if (theme) theme.init();
        if (i18n) i18n.init();
        var themeSelect = document.getElementById('themeSelect');
        if (themeSelect && theme) {
            themeSelect.value = theme.getTheme();
            themeSelect.addEventListener('change', function () { theme.setTheme(this.value); });
        }
        var localeSelect = document.getElementById('localeSelect');
        if (localeSelect && i18n) {
            localeSelect.value = i18n.getLocale();
            localeSelect.addEventListener('change', function () {
                i18n.setLocale(this.value);
                if (themeSelect) themeSelect.value = theme.getTheme();
            });
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPreferences);
    else initPreferences();
})();
