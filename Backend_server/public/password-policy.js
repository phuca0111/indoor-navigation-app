// password-policy.js — client mirror of Backend_server/utils/passwordPolicy.js
(function (global) {
    function validatePasswordStrength(password) {
        var errors = [];
        var pwd = typeof password === 'string' ? password : '';
        if (!pwd || pwd.length < 8) {
            errors.push('Mật khẩu phải có ít nhất 8 ký tự.');
            return errors;
        }
        if (!/(?=.*[a-z])/.test(pwd)) {
            errors.push('Mật khẩu phải chứa ít nhất 1 chữ thường.');
        }
        if (!/(?=.*[A-Z])/.test(pwd)) {
            errors.push('Mật khẩu phải chứa ít nhất 1 chữ hoa.');
        }
        if (!/(?=.*\d)/.test(pwd)) {
            errors.push('Mật khẩu phải chứa ít nhất 1 số.');
        }
        if (!/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(pwd)) {
            errors.push('Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt.');
        }
        return errors;
    }

    global.PasswordPolicy = {
        validatePasswordStrength: validatePasswordStrength,
        hint: 'Ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.'
    };
})(typeof window !== 'undefined' ? window : this);
