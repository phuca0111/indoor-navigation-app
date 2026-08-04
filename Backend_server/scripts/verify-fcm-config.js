/**
 * Kiểm tra cấu hình FCM production (không gửi push thật trừ khi --send-test TOKEN).
 *
 * Usage:
 *   node scripts/verify-fcm-config.js
 *   node scripts/verify-fcm-config.js --send-test <fcm_device_token>
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const {
  getFcmRuntimeStatus,
  sendFcmPush,
  resetForTests,
} = require('../services/fcmPushAdapter');

async function main() {
  resetForTests();
  const status = getFcmRuntimeStatus();
  console.log(JSON.stringify(status, null, 2));

  if (!status.ready) {
    console.log(`
Chưa sẵn sàng production. Làm lần lượt:
  1) Firebase Console → Project settings → Service accounts → Generate new private key
  2) Lưu file (KHÔNG commit): Backend_server/secrets/firebase-service-account.json
     hoặc ops/secrets/firebase-service-account.json
  3) Trong Backend_server/.env:
       FCM_ENABLED=true
       FCM_PROJECT_ID=<project_id trong JSON>
       FCM_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json
  4) Android: tải google-services.json vào IndoorNavigationApp/app/
     (package com.khoaluan.indoornav phải khớp Firebase app)
  5) Restart node server.js → chạy lại script này
`);
    process.exitCode = 1;
    return;
  }

  console.log('OK — FCM production credentials hợp lệ.');

  const args = process.argv.slice(2);
  const sendIdx = args.indexOf('--send-test');
  if (sendIdx >= 0) {
    const token = args[sendIdx + 1];
    if (!token) {
      console.error('Thiếu FCM token sau --send-test');
      process.exitCode = 1;
      return;
    }
    const result = await sendFcmPush({
      recipient: token,
      category: 'EMERGENCY',
      rendered_payload: {
        title: 'IndoorNav FCM test',
        body: 'Push production thử nghiệm từ verify-fcm-config.js',
        data: {
          incident_type: 'TEST',
          incident_id: `verify-${Date.now()}`,
        },
      },
    });
    console.log('send result:', result);
    if (result.stub || result.deferred) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
