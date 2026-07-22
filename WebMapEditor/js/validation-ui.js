// ============================================================
// VALIDATION-UI.JS — WE5: Panel lỗi/cảnh báo trước xuất bản
// Client (ExportPipeline) + Server (validate / job FAILED)
// ============================================================
(function () {
    'use strict';

    function qs(sel, root) {
        return (root || document).querySelector(sel);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeItems(list, defaultLevel) {
        if (!list || !list.length) return [];
        return list.map(function (item) {
            if (typeof item === 'string') {
                return { level: defaultLevel || 'error', code: '', message: item };
            }
            return {
                level: item.level || item.severity || defaultLevel || 'error',
                code: item.code || '',
                message: item.message || item.msg || JSON.stringify(item),
                meta: item.meta || item.details || null
            };
        });
    }

    function openRightValidateTab() {
        document.body.classList.remove('right-collapsed');
        document.body.classList.remove('focus-mode');
        var tab = qs('.right-tab[data-rtab="validate"]');
        var panel = qs('.right-panel[data-rtab="validate"]');
        if (tab && panel) {
            document.querySelectorAll('.right-tab').forEach(function (t) {
                t.classList.toggle('active', t === tab);
                t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
            });
            document.querySelectorAll('.right-panel').forEach(function (p) {
                p.classList.toggle('active', p === panel);
            });
            try {
                var raw = localStorage.getItem('wme_ui_shell_v2');
                var prefs = raw ? JSON.parse(raw) : {};
                prefs.rightTab = 'validate';
                localStorage.setItem('wme_ui_shell_v2', JSON.stringify(prefs));
            } catch (e) { /* ignore */ }
        }
        if (typeof window.uiShellLayoutReflow === 'function') {
            window.uiShellLayoutReflow();
        }
    }

    function setSummary(text, kind) {
        var el = qs('#validationSummary');
        if (!el) return;
        el.textContent = text || '';
        el.className = 'validation-summary' + (kind ? ' validation-summary--' + kind : '');
    }

    function renderList(containerSel, items, emptyText) {
        var el = qs(containerSel);
        if (!el) return;
        if (!items.length) {
            el.innerHTML = '<p class="hint-text">' + escapeHtml(emptyText) + '</p>';
            return;
        }
        el.innerHTML = items.map(function (it) {
            var code = it.code ? '<span class="validation-code">' + escapeHtml(it.code) + '</span> ' : '';
            return '<li class="validation-item validation-item--' + escapeHtml(it.level) + '">' +
                code + '<span class="validation-msg">' + escapeHtml(it.message) + '</span></li>';
        }).join('');
    }

    /**
     * @param {{ errors?: Array, warnings?: Array, source?: string, title?: string }} opts
     */
    function showValidationResults(opts) {
        opts = opts || {};
        var errors = normalizeItems(opts.errors, 'error');
        var warnings = normalizeItems(opts.warnings, 'warning');
        var source = opts.source || 'client';
        var title = opts.title || 'Kết quả kiểm tra';

        var titleEl = qs('#validationPanelTitle');
        if (titleEl) titleEl.textContent = title;

        var sourceEl = qs('#validationSource');
        if (sourceEl) {
            sourceEl.textContent = source === 'server' ? 'Máy chủ'
                : (source === 'mixed' ? 'Máy khách + Máy chủ' : 'Máy khách');
        }

        renderList('#validationErrorList', errors, 'Không có lỗi.');
        renderList('#validationWarningList', warnings, 'Không có cảnh báo.');

        var errCount = errors.length;
        var warnCount = warnings.length;
        if (errCount) {
            setSummary(errCount + ' lỗi · ' + warnCount + ' cảnh báo — chưa xuất bản được.', 'error');
        } else if (warnCount) {
            setSummary('Không lỗi · ' + warnCount + ' cảnh báo — có thể xuất bản sau khi xác nhận.', 'warn');
        } else {
            setSummary('Đạt — không lỗi, không cảnh báo.', 'ok');
        }

        var badge = qs('#validationBadge');
        if (badge) {
            badge.textContent = errCount ? String(errCount) : (warnCount ? String(warnCount) : '0');
            badge.className = 'validation-badge' +
                (errCount ? ' validation-badge--error' :
                    (warnCount ? ' validation-badge--warn' : ' validation-badge--ok'));
            badge.style.display = 'inline-flex';
        }

        openRightValidateTab();
    }

    function clearValidationPanel() {
        showValidationResults({
            errors: [],
            warnings: [],
            source: 'client',
            title: 'Kiểm tra bản đồ'
        });
        setSummary('Chưa chạy kiểm tra.', '');
        var badge = qs('#validationBadge');
        if (badge) badge.style.display = 'none';
    }

    function runClientValidation() {
        var pipelineResult;
        try {
            if (window.EditorCore && EditorCore.ExportPipeline) {
                pipelineResult = EditorCore.ExportPipeline.run({ skipValidation: false });
            } else if (window.EditorCore && typeof EditorCore.validateMapData === 'function' &&
                typeof buildCurrentMapDataForDraftOrPublish === 'function') {
                var mapData = buildCurrentMapDataForDraftOrPublish();
                var v = EditorCore.validateMapData(mapData);
                pipelineResult = { ok: v.ok, validation: v, mapData: mapData };
            } else {
                showValidationResults({
                    errors: [{ message: 'Thiếu ValidationEngine / ExportPipeline.', code: 'NO_ENGINE' }],
                    source: 'client'
                });
                return { ok: false };
            }
        } catch (err) {
            showValidationResults({
                errors: [{ message: 'Lỗi chạy kiểm tra: ' + (err.message || err), code: 'CLIENT_CRASH' }],
                source: 'client'
            });
            return { ok: false };
        }

        var validation = pipelineResult.validation || { ok: true, errors: [], warnings: [] };
        showValidationResults({
            errors: validation.errors || [],
            warnings: validation.warnings || [],
            source: 'client',
            title: 'Kiểm tra máy khách'
        });
        return {
            ok: !!pipelineResult.ok,
            validation: validation,
            mapData: pipelineResult.mapData
        };
    }

    async function runFullValidation() {
        var client = runClientValidation();
        if (!client.ok) {
            if (typeof showToast === 'function') {
                showToast('Có lỗi máy khách — sửa trước khi xuất bản.', 'error');
            }
            return client;
        }

        if (!window.buildingId || !window.PublishApi || typeof PublishApi.validatePublish !== 'function') {
            if (typeof showToast === 'function') {
                showToast('Kiểm tra máy khách đạt.', 'success');
            }
            return client;
        }

        if (typeof showLoading === 'function') showLoading('Đang kiểm tra trên máy chủ…');
        try {
            var mapData = client.mapData;
            if (!mapData && typeof buildCurrentMapDataForDraftOrPublish === 'function') {
                mapData = buildCurrentMapDataForDraftOrPublish();
            }
            var server = await PublishApi.validatePublish(
                window.buildingId,
                (document.getElementById('floorSelect') || {}).value || '0',
                mapData,
                typeof apiFetch === 'function' ? apiFetch : null
            );
            if (typeof hideLoading === 'function') hideLoading();

            if (server.ok) {
                showValidationResults({
                    errors: (client.validation && client.validation.errors) || [],
                    warnings: (client.validation && client.validation.warnings) || [],
                    source: 'mixed',
                    title: 'Kiểm tra đạt (máy khách + máy chủ)'
                });
                if (typeof showToast === 'function') {
                    showToast('Kiểm tra đạt — có thể xuất bản.', 'success');
                }
                return { ok: true, client: client, server: server };
            }

            var serverErrors = normalizeItems(server.errors || [], 'error');
            if (!serverErrors.length && server.message) {
                serverErrors = [{ level: 'error', code: server.code || 'VALIDATE_FAILED', message: server.message }];
            }
            showValidationResults({
                errors: serverErrors,
                warnings: (client.validation && client.validation.warnings) || [],
                source: 'server',
                title: 'Máy chủ từ chối — chưa xuất bản'
            });
            if (typeof showToast === 'function') {
                showToast(server.message || 'Validate máy chủ thất bại.', 'error');
            }
            return { ok: false, client: client, server: server };
        } catch (e) {
            if (typeof hideLoading === 'function') hideLoading();
            if (typeof showToast === 'function') {
                showToast('Không gọi được validate máy chủ: ' + (e.message || e), 'error');
            }
            return { ok: client.ok, client: client, serverError: e };
        }
    }

    function showServerPublishErrors(errors, message) {
        var list = normalizeItems(errors, 'error');
        if (!list.length && message) {
            list = [{ level: 'error', code: 'PUBLISH_FAILED', message: message }];
        }
        showValidationResults({
            errors: list,
            warnings: [],
            source: 'server',
            title: 'Xuất bản thất bại'
        });
    }

    function initValidationUi() {
        var rerunBtn = qs('#btnValidationRerun');
        var clearBtn = qs('#btnValidationClear');
        if (rerunBtn) {
            rerunBtn.addEventListener('click', function () {
                runFullValidation();
            });
        }
        if (clearBtn) {
            clearBtn.addEventListener('click', clearValidationPanel);
        }
    }

    window.ValidationUI = {
        show: showValidationResults,
        clear: clearValidationPanel,
        runClient: runClientValidation,
        runFull: runFullValidation,
        showServerErrors: showServerPublishErrors,
        openTab: openRightValidateTab
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initValidationUi);
    } else {
        initValidationUi();
    }
})();
