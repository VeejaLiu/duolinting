import type { UiLocale } from '@duolinting/domain'

// AuthDialog.tsx 登录/注册弹窗的文案。key 统一使用 `auth.` 前缀。
// en/th/ja 译文照抄自 LanguageProvider 的 legacyTranslationCatalogs（「登录」除外，旧目录无此条目，为新翻）。
export const authDialogMessages: Record<UiLocale, Record<string, string>> = {
  'zh-CN': {
    'auth.accountCenter': '账号中心',
    'auth.linkedToAccount': '学习记录已接入账号',
    'auth.loginToSave': '登录后保存你的课程学习记录',
    'auth.loginOrSignup': '登录或注册',
    'auth.login': '登录',
    'auth.signup': '注册',
    'auth.email': '邮箱',
    'auth.displayName': '昵称',
    'auth.password': '密码',
    'auth.enterDisplayName': '请输入昵称',
    'auth.enterPassword': '请输入密码',
    'auth.passwordHint': '至少 8 位，包含字母和数字',
    'auth.logout': '退出登录',
    'auth.createAccount': '创建账号',
    'auth.closeDialog': '关闭登录弹窗',
    'auth.loggedIn': '已登录',
    'auth.accountCreated': '账号已创建',
    'auth.actionFailed': '账号操作失败',
    'auth.emailRequired': '邮箱不能为空',
    'auth.emailInvalid': '邮箱格式不正确',
    'auth.displayNameRequired': '昵称不能为空',
    'auth.displayNameTooShort': '昵称至少需要 2 个字符',
    'auth.displayNameTooLong': '昵称最多 20 个字符',
    'auth.displayNameInvalidChars': '昵称只能包含中文、字母、数字和下划线',
    'auth.passwordRequired': '密码不能为空',
    'auth.passwordTooShort': '密码至少需要 8 个字符',
    'auth.passwordNeedsLetter': '密码必须包含字母',
    'auth.passwordNeedsDigit': '密码必须包含数字',
    'auth.resetPasswordTitle': '通过邮箱重置密码',
    'auth.backToLogin': '返回登录',
    'auth.verificationCode': '邮箱验证码',
    'auth.codePlaceholder': '6 位验证码',
    'auth.sendCode': '发送验证码',
    'auth.sendingCode': '发送中…',
    'auth.codeInvalid': '请输入 6 位邮箱验证码',
    'auth.codeSent': '验证码已发送，请检查邮箱',
    'auth.codeCooldown': '验证码刚刚已发送，请在 {{seconds}} 秒后重试',
    'auth.codeNotRequired': '当前环境未启用邮箱验证，可直接继续',
    'auth.codeSendFailed': '验证码发送失败',
    'auth.forgotPassword': '忘记密码？',
    'auth.newPassword': '新密码',
    'auth.resetPassword': '重置密码',
    'auth.passwordResetComplete': '密码已重置，请使用新密码登录',
    'auth.emailAlreadyRegistered': '该邮箱已经注册，请直接登录',
    'auth.codeIncorrect': '验证码不正确，请重新输入',
    'auth.codeExpired': '验证码已过期，请重新发送',
    'auth.codeLocked': '验证码错误次数过多，请重新发送',
    'auth.emailServiceUnavailable': '邮箱服务暂时不可用，请稍后重试',
    'auth.secureHint': '安全验证与学习记录同步都在这里完成',
    'auth.resendIn': '{{seconds}} 秒后重发',
    'auth.codeExpiresIn': '验证码有效期还剩 {{minutes}}:{{seconds}}',
    'auth.codeValidity': '验证码 {{minutes}} 分钟内有效；同一邮箱和 IP 每小时最多发送 {{count}} 次',
    'auth.codeRateLimited': '发送次数已达到每小时上限，请稍后再试',
    'auth.toastSentTitle': '邮件飞出去啦',
    'auth.toastNoticeTitle': '温馨提示',
    'auth.toastSuccessTitle': '完成啦',
    'auth.toastErrorTitle': '没有完成',
    'auth.loggedOutToast': '已安全退出当前账号',
    'auth.invalidCredentials': '邮箱或密码不正确，请重新检查',
    'toast.dismiss': '关闭提示',
  },
  'en-US': {
    'auth.accountCenter': 'Account',
    'auth.linkedToAccount': 'Your learning progress is linked to your account',
    'auth.loginToSave': 'Log in to save your learning progress',
    'auth.loginOrSignup': 'Log in or sign up',
    'auth.login': 'Log in',
    'auth.signup': 'Sign up',
    'auth.email': 'Email',
    'auth.displayName': 'Display name',
    'auth.password': 'Password',
    'auth.enterDisplayName': 'Enter a display name',
    'auth.enterPassword': 'Enter your password',
    'auth.passwordHint': 'At least 8 characters with letters and numbers',
    'auth.logout': 'Log out',
    'auth.createAccount': 'Create account',
    'auth.closeDialog': 'Close account dialog',
    'auth.loggedIn': 'Logged in',
    'auth.accountCreated': 'Account created',
    'auth.actionFailed': 'Account action failed',
    'auth.emailRequired': 'Email is required',
    'auth.emailInvalid': 'Enter a valid email address',
    'auth.displayNameRequired': 'Display name is required',
    'auth.displayNameTooShort': 'Display name must be at least 2 characters',
    'auth.displayNameTooLong': 'Display name must be at most 20 characters',
    'auth.displayNameInvalidChars': 'Use letters, numbers, underscores, or Chinese characters',
    'auth.passwordRequired': 'Password is required',
    'auth.passwordTooShort': 'Password must be at least 8 characters',
    'auth.passwordNeedsLetter': 'Password must include a letter',
    'auth.passwordNeedsDigit': 'Password must include a number',
    'auth.resetPasswordTitle': 'Reset your password by email',
    'auth.backToLogin': 'Back to login',
    'auth.verificationCode': 'Email verification code',
    'auth.codePlaceholder': '6-digit code',
    'auth.sendCode': 'Send code',
    'auth.sendingCode': 'Sending…',
    'auth.codeInvalid': 'Enter the 6-digit email code',
    'auth.codeSent': 'Code sent. Check your inbox.',
    'auth.codeCooldown': 'A code was just sent. Try again in {{seconds}} seconds.',
    'auth.codeNotRequired': 'Email verification is disabled here. You can continue.',
    'auth.codeSendFailed': 'Unable to send the verification code',
    'auth.forgotPassword': 'Forgot password?',
    'auth.newPassword': 'New password',
    'auth.resetPassword': 'Reset password',
    'auth.passwordResetComplete': 'Password reset. Log in with your new password.',
    'auth.emailAlreadyRegistered': 'This email is already registered. Log in instead.',
    'auth.codeIncorrect': 'That code is incorrect. Try again.',
    'auth.codeExpired': 'That code has expired. Send a new one.',
    'auth.codeLocked': 'Too many incorrect attempts. Send a new code.',
    'auth.emailServiceUnavailable': 'Email service is temporarily unavailable. Try again later.',
    'auth.secureHint': 'Secure verification and learning sync happen here',
    'auth.resendIn': 'Resend in {{seconds}}s',
    'auth.codeExpiresIn': 'Code expires in {{minutes}}:{{seconds}}',
    'auth.codeValidity': 'Codes last {{minutes}} minutes; up to {{count}} sends per email and IP each hour',
    'auth.codeRateLimited': 'You have reached the hourly send limit. Try again later.',
    'auth.toastSentTitle': 'Email on its way',
    'auth.toastNoticeTitle': 'A quick note',
    'auth.toastSuccessTitle': 'All set',
    'auth.toastErrorTitle': 'That did not work',
    'auth.loggedOutToast': 'You have safely logged out',
    'auth.invalidCredentials': 'The email or password is incorrect. Check them and try again.',
    'toast.dismiss': 'Dismiss notification',
  },
  'th-TH': {
    'auth.accountCenter': 'บัญชี',
    'auth.linkedToAccount': 'ความคืบหน้าการเรียนของคุณเชื่อมกับบัญชีแล้ว',
    'auth.loginToSave': 'เข้าสู่ระบบเพื่อบันทึกความคืบหน้าการเรียนของคุณ',
    'auth.loginOrSignup': 'เข้าสู่ระบบหรือสมัครสมาชิก',
    'auth.login': 'เข้าสู่ระบบ',
    'auth.signup': 'สมัครสมาชิก',
    'auth.email': 'อีเมล',
    'auth.displayName': 'ชื่อแสดง',
    'auth.password': 'รหัสผ่าน',
    'auth.enterDisplayName': 'กรุณากรอกชื่อแสดง',
    'auth.enterPassword': 'กรุณากรอกรหัสผ่าน',
    'auth.passwordHint': 'อย่างน้อย 8 ตัวอักษร ประกอบด้วยตัวอักษรและตัวเลข',
    'auth.logout': 'ออกจากระบบ',
    'auth.createAccount': 'สร้างบัญชี',
    'auth.closeDialog': 'ปิดหน้าต่างบัญชี',
    'auth.loggedIn': 'เข้าสู่ระบบแล้ว',
    'auth.accountCreated': 'สร้างบัญชีแล้ว',
    'auth.actionFailed': 'การดำเนินการกับบัญชีล้มเหลว',
    'auth.emailRequired': 'กรุณากรอกอีเมล',
    'auth.emailInvalid': 'กรุณากรอกอีเมลที่ถูกต้อง',
    'auth.displayNameRequired': 'กรุณากรอกชื่อแสดง',
    'auth.displayNameTooShort': 'ชื่อแสดงต้องมีอย่างน้อย 2 ตัวอักษร',
    'auth.displayNameTooLong': 'ชื่อแสดงต้องไม่เกิน 20 ตัวอักษร',
    'auth.displayNameInvalidChars': 'ใช้ได้เฉพาะตัวอักษร ตัวเลข ขีดล่าง หรืออักษรจีน',
    'auth.passwordRequired': 'กรุณากรอกรหัสผ่าน',
    'auth.passwordTooShort': 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร',
    'auth.passwordNeedsLetter': 'รหัสผ่านต้องมีตัวอักษรอย่างน้อย 1 ตัว',
    'auth.passwordNeedsDigit': 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว',
    'auth.resetPasswordTitle': 'รีเซ็ตรหัสผ่านทางอีเมล',
    'auth.backToLogin': 'กลับไปเข้าสู่ระบบ',
    'auth.verificationCode': 'รหัสยืนยันอีเมล',
    'auth.codePlaceholder': 'รหัส 6 หลัก',
    'auth.sendCode': 'ส่งรหัส',
    'auth.sendingCode': 'กำลังส่ง…',
    'auth.codeInvalid': 'กรอกรหัสอีเมล 6 หลัก',
    'auth.codeSent': 'ส่งรหัสแล้ว โปรดตรวจสอบกล่องจดหมาย',
    'auth.codeCooldown': 'เพิ่งส่งรหัส โปรดลองอีกครั้งใน {{seconds}} วินาที',
    'auth.codeNotRequired': 'สภาพแวดล้อมนี้ไม่ได้เปิดใช้การยืนยันอีเมล คุณดำเนินการต่อได้',
    'auth.codeSendFailed': 'ส่งรหัสยืนยันไม่สำเร็จ',
    'auth.forgotPassword': 'ลืมรหัสผ่าน?',
    'auth.newPassword': 'รหัสผ่านใหม่',
    'auth.resetPassword': 'รีเซ็ตรหัสผ่าน',
    'auth.passwordResetComplete': 'รีเซ็ตรหัสผ่านแล้ว โปรดเข้าสู่ระบบด้วยรหัสผ่านใหม่',
    'auth.emailAlreadyRegistered': 'อีเมลนี้ลงทะเบียนแล้ว โปรดเข้าสู่ระบบ',
    'auth.codeIncorrect': 'รหัสไม่ถูกต้อง โปรดลองอีกครั้ง',
    'auth.codeExpired': 'รหัสหมดอายุแล้ว โปรดส่งรหัสใหม่',
    'auth.codeLocked': 'กรอกรหัสผิดหลายครั้งเกินไป โปรดส่งรหัสใหม่',
    'auth.emailServiceUnavailable': 'บริการอีเมลไม่พร้อมใช้งานชั่วคราว โปรดลองภายหลัง',
    'auth.secureHint': 'ยืนยันตัวตนอย่างปลอดภัยและซิงค์การเรียนรู้ได้ที่นี่',
    'auth.resendIn': 'ส่งใหม่ใน {{seconds}} วินาที',
    'auth.codeExpiresIn': 'รหัสหมดอายุใน {{minutes}}:{{seconds}}',
    'auth.codeValidity': 'รหัสมีอายุ {{minutes}} นาที ส่งได้สูงสุด {{count}} ครั้งต่ออีเมลและ IP ต่อชั่วโมง',
    'auth.codeRateLimited': 'ส่งถึงขีดจำกัดรายชั่วโมงแล้ว โปรดลองภายหลัง',
    'auth.toastSentTitle': 'ส่งอีเมลแล้ว',
    'auth.toastNoticeTitle': 'แจ้งให้ทราบ',
    'auth.toastSuccessTitle': 'เรียบร้อยแล้ว',
    'auth.toastErrorTitle': 'ยังไม่สำเร็จ',
    'auth.loggedOutToast': 'ออกจากระบบอย่างปลอดภัยแล้ว',
    'auth.invalidCredentials': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง โปรดตรวจสอบแล้วลองใหม่',
    'toast.dismiss': 'ปิดการแจ้งเตือน',
  },
  'ja-JP': {
    'auth.accountCenter': 'アカウント',
    'auth.linkedToAccount': '学習記録がアカウントに連携されました',
    'auth.loginToSave': 'ログインして学習記録を保存しましょう',
    'auth.loginOrSignup': 'ログインまたは新規登録',
    'auth.login': 'ログイン',
    'auth.signup': '新規登録',
    'auth.email': 'メールアドレス',
    'auth.displayName': '表示名',
    'auth.password': 'パスワード',
    'auth.enterDisplayName': '表示名を入力してください',
    'auth.enterPassword': 'パスワードを入力してください',
    'auth.passwordHint': '英数字を含む8文字以上',
    'auth.logout': 'ログアウト',
    'auth.createAccount': 'アカウント作成',
    'auth.closeDialog': 'アカウントダイアログを閉じる',
    'auth.loggedIn': 'ログイン済み',
    'auth.accountCreated': 'アカウントを作成しました',
    'auth.actionFailed': 'アカウント操作に失敗しました',
    'auth.emailRequired': 'メールアドレスを入力してください',
    'auth.emailInvalid': '有効なメールアドレスを入力してください',
    'auth.displayNameRequired': '表示名を入力してください',
    'auth.displayNameTooShort': '表示名は2文字以上で入力してください',
    'auth.displayNameTooLong': '表示名は20文字以内で入力してください',
    'auth.displayNameInvalidChars': '英数字、アンダースコア、中国語文字のみ使用できます',
    'auth.passwordRequired': 'パスワードを入力してください',
    'auth.passwordTooShort': 'パスワードは8文字以上で入力してください',
    'auth.passwordNeedsLetter': 'パスワードには英字を含めてください',
    'auth.passwordNeedsDigit': 'パスワードには数字を含めてください',
    'auth.resetPasswordTitle': 'メールでパスワードを再設定',
    'auth.backToLogin': 'ログインに戻る',
    'auth.verificationCode': 'メール認証コード',
    'auth.codePlaceholder': '6桁のコード',
    'auth.sendCode': 'コードを送信',
    'auth.sendingCode': '送信中…',
    'auth.codeInvalid': '6桁のメール認証コードを入力してください',
    'auth.codeSent': 'コードを送信しました。メールを確認してください。',
    'auth.codeCooldown': 'コードは送信済みです。{{seconds}}秒後に再試行してください。',
    'auth.codeNotRequired': 'この環境ではメール認証が無効です。そのまま続行できます。',
    'auth.codeSendFailed': '認証コードを送信できませんでした',
    'auth.forgotPassword': 'パスワードをお忘れですか？',
    'auth.newPassword': '新しいパスワード',
    'auth.resetPassword': 'パスワードを再設定',
    'auth.passwordResetComplete': 'パスワードを再設定しました。新しいパスワードでログインしてください。',
    'auth.emailAlreadyRegistered': 'このメールアドレスは登録済みです。ログインしてください。',
    'auth.codeIncorrect': 'コードが正しくありません。もう一度入力してください。',
    'auth.codeExpired': 'コードの有効期限が切れました。新しいコードを送信してください。',
    'auth.codeLocked': '入力回数が上限に達しました。新しいコードを送信してください。',
    'auth.emailServiceUnavailable': 'メールサービスを一時的に利用できません。後でもう一度お試しください。',
    'auth.secureHint': '安全な認証と学習記録の同期をここで行います',
    'auth.resendIn': '{{seconds}}秒後に再送',
    'auth.codeExpiresIn': 'コードの有効期限まで {{minutes}}:{{seconds}}',
    'auth.codeValidity': 'コードは{{minutes}}分間有効です。メールとIPごとに1時間{{count}}回まで送信できます',
    'auth.codeRateLimited': '1時間あたりの送信上限に達しました。後でもう一度お試しください。',
    'auth.toastSentTitle': 'メールを送信しました',
    'auth.toastNoticeTitle': 'お知らせ',
    'auth.toastSuccessTitle': '完了しました',
    'auth.toastErrorTitle': '完了できませんでした',
    'auth.loggedOutToast': '安全にログアウトしました',
    'auth.invalidCredentials': 'メールアドレスまたはパスワードが正しくありません。',
    'toast.dismiss': '通知を閉じる',
  },
  "fr-FR": {
    "auth.accountCenter": "Compte",
    "auth.linkedToAccount": "Votre progression est liée à votre compte",
    "auth.loginToSave": "Connectez-vous pour enregistrer votre progression",
    "auth.loginOrSignup": "Se connecter ou s’inscrire",
    "auth.login": "Se connecter",
    "auth.signup": "S’inscrire",
    "auth.email": "E-mail",
    "auth.displayName": "Nom affiché",
    "auth.password": "Mot de passe",
    "auth.enterDisplayName": "Saisissez un nom à afficher",
    "auth.enterPassword": "Saisissez votre mot de passe",
    "auth.passwordHint": "Au moins 8 caractères, avec des lettres et des chiffres",
    "auth.logout": "Se déconnecter",
    "auth.createAccount": "Créer un compte",
    "auth.closeDialog": "Fermer la fenêtre du compte",
    "auth.loggedIn": "Connecté",
    "auth.accountCreated": "Compte créé",
    "auth.actionFailed": "Échec de l’opération sur le compte",
    "auth.emailRequired": "L’e-mail est obligatoire",
    "auth.emailInvalid": "Saisissez une adresse e-mail valide",
    "auth.displayNameRequired": "Le nom affiché est obligatoire",
    "auth.displayNameTooShort": "Le nom doit contenir au moins 2 caractères",
    "auth.displayNameTooLong": "Le nom doit contenir au maximum 20 caractères",
    "auth.displayNameInvalidChars": "Utilisez des lettres, chiffres, tirets bas ou caractères chinois",
    "auth.passwordRequired": "Le mot de passe est obligatoire",
    "auth.passwordTooShort": "Le mot de passe doit contenir au moins 8 caractères",
    "auth.passwordNeedsLetter": "Le mot de passe doit contenir une lettre",
    "auth.passwordNeedsDigit": "Le mot de passe doit contenir un chiffre"
    ,"auth.resetPasswordTitle": "Réinitialiser le mot de passe par e-mail"
    ,"auth.backToLogin": "Retour à la connexion"
    ,"auth.verificationCode": "Code de vérification par e-mail"
    ,"auth.codePlaceholder": "Code à 6 chiffres"
    ,"auth.sendCode": "Envoyer le code"
    ,"auth.sendingCode": "Envoi…"
    ,"auth.codeInvalid": "Saisissez le code à 6 chiffres"
    ,"auth.codeSent": "Code envoyé. Consultez votre boîte de réception."
    ,"auth.codeCooldown": "Un code vient d’être envoyé. Réessayez dans {{seconds}} secondes."
    ,"auth.codeNotRequired": "La vérification par e-mail est désactivée ici. Vous pouvez continuer."
    ,"auth.codeSendFailed": "Impossible d’envoyer le code de vérification"
    ,"auth.forgotPassword": "Mot de passe oublié ?"
    ,"auth.newPassword": "Nouveau mot de passe"
    ,"auth.resetPassword": "Réinitialiser le mot de passe"
    ,"auth.passwordResetComplete": "Mot de passe réinitialisé. Connectez-vous avec le nouveau mot de passe."
    ,"auth.emailAlreadyRegistered": "Cette adresse est déjà enregistrée. Connectez-vous."
    ,"auth.codeIncorrect": "Ce code est incorrect. Réessayez."
    ,"auth.codeExpired": "Ce code a expiré. Envoyez-en un nouveau."
    ,"auth.codeLocked": "Trop de tentatives incorrectes. Envoyez un nouveau code."
    ,"auth.emailServiceUnavailable": "Le service de messagerie est temporairement indisponible. Réessayez plus tard."
    ,"auth.secureHint": "La vérification sécurisée et la synchronisation se font ici."
    ,"auth.resendIn": "Renvoyer dans {{seconds}} s"
    ,"auth.codeExpiresIn": "Le code expire dans {{minutes}}:{{seconds}}"
    ,"auth.codeValidity": "Le code reste valable {{minutes}} minutes, avec {{count}} envois maximum par e-mail et IP chaque heure."
    ,"auth.codeRateLimited": "La limite horaire d’envoi est atteinte. Réessayez plus tard."
    ,"auth.toastSentTitle": "E-mail envoyé"
    ,"auth.toastNoticeTitle": "À savoir"
    ,"auth.toastSuccessTitle": "C’est fait"
    ,"auth.toastErrorTitle": "L’action a échoué"
    ,"auth.loggedOutToast": "Vous êtes déconnecté en toute sécurité."
    ,"auth.invalidCredentials": "L’adresse e-mail ou le mot de passe est incorrect."
    ,"toast.dismiss": "Fermer la notification"
},
  "es-ES": {
    "auth.accountCenter": "Cuenta",
    "auth.linkedToAccount": "Tu progreso está vinculado a tu cuenta",
    "auth.loginToSave": "Inicia sesión para guardar tu progreso",
    "auth.loginOrSignup": "Iniciar sesión o registrarse",
    "auth.login": "Iniciar sesión",
    "auth.signup": "Registrarse",
    "auth.email": "Correo electrónico",
    "auth.displayName": "Nombre visible",
    "auth.password": "Contraseña",
    "auth.enterDisplayName": "Introduce un nombre visible",
    "auth.enterPassword": "Introduce tu contraseña",
    "auth.passwordHint": "Al menos 8 caracteres, con letras y números",
    "auth.logout": "Cerrar sesión",
    "auth.createAccount": "Crear cuenta",
    "auth.closeDialog": "Cerrar la ventana de la cuenta",
    "auth.loggedIn": "Sesión iniciada",
    "auth.accountCreated": "Cuenta creada",
    "auth.actionFailed": "No se pudo completar la operación de la cuenta",
    "auth.emailRequired": "El correo electrónico es obligatorio",
    "auth.emailInvalid": "Introduce una dirección de correo válida",
    "auth.displayNameRequired": "El nombre visible es obligatorio",
    "auth.displayNameTooShort": "El nombre debe tener al menos 2 caracteres",
    "auth.displayNameTooLong": "El nombre debe tener como máximo 20 caracteres",
    "auth.displayNameInvalidChars": "Usa letras, números, guiones bajos o caracteres chinos",
    "auth.passwordRequired": "La contraseña es obligatoria",
    "auth.passwordTooShort": "La contraseña debe tener al menos 8 caracteres",
    "auth.passwordNeedsLetter": "La contraseña debe incluir una letra",
    "auth.passwordNeedsDigit": "La contraseña debe incluir un número"
    ,"auth.resetPasswordTitle": "Restablecer la contraseña por correo"
    ,"auth.backToLogin": "Volver al inicio de sesión"
    ,"auth.verificationCode": "Código de verificación por correo"
    ,"auth.codePlaceholder": "Código de 6 dígitos"
    ,"auth.sendCode": "Enviar código"
    ,"auth.sendingCode": "Enviando…"
    ,"auth.codeInvalid": "Introduce el código de 6 dígitos"
    ,"auth.codeSent": "Código enviado. Revisa tu bandeja de entrada."
    ,"auth.codeCooldown": "Acabamos de enviar un código. Inténtalo de nuevo en {{seconds}} segundos."
    ,"auth.codeNotRequired": "La verificación por correo está desactivada aquí. Puedes continuar."
    ,"auth.codeSendFailed": "No se pudo enviar el código de verificación"
    ,"auth.forgotPassword": "¿Olvidaste la contraseña?"
    ,"auth.newPassword": "Nueva contraseña"
    ,"auth.resetPassword": "Restablecer contraseña"
    ,"auth.passwordResetComplete": "Contraseña restablecida. Inicia sesión con la nueva contraseña."
    ,"auth.emailAlreadyRegistered": "Este correo ya está registrado. Inicia sesión."
    ,"auth.codeIncorrect": "El código es incorrecto. Inténtalo de nuevo."
    ,"auth.codeExpired": "El código ha caducado. Envía uno nuevo."
    ,"auth.codeLocked": "Demasiados intentos incorrectos. Envía un código nuevo."
    ,"auth.emailServiceUnavailable": "El servicio de correo no está disponible temporalmente. Inténtalo más tarde."
    ,"auth.secureHint": "Aquí realizamos la verificación segura y la sincronización."
    ,"auth.resendIn": "Reenviar en {{seconds}} s"
    ,"auth.codeExpiresIn": "El código caduca en {{minutes}}:{{seconds}}"
    ,"auth.codeValidity": "El código dura {{minutes}} minutos; máximo {{count}} envíos por correo e IP cada hora."
    ,"auth.codeRateLimited": "Has alcanzado el límite horario de envíos. Inténtalo más tarde."
    ,"auth.toastSentTitle": "Correo enviado"
    ,"auth.toastNoticeTitle": "Aviso rápido"
    ,"auth.toastSuccessTitle": "Todo listo"
    ,"auth.toastErrorTitle": "No se pudo completar"
    ,"auth.loggedOutToast": "Has cerrado sesión de forma segura."
    ,"auth.invalidCredentials": "El correo o la contraseña no son correctos."
    ,"toast.dismiss": "Cerrar notificación"
},
}
