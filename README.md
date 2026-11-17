# PGS Subtitle Uploader for Vercel

واجهة خاصة لإدارة ترجمات SUP/PGS وربطها بمعرّف IMDb. ملفات SUP ترفع مباشرة من المتصفح إلى Vercel Blob، حتى لا تمر عبر حد طلبات Functions البالغ 4.5MB.

## قبل النشر
1. اربط المستودع بـ Vercel.
2. أنشئ Blob Store من Storage داخل مشروع Vercel. اختر **Public** لأن Stremio يحتاج رابطًا مباشرًا قابلًا للقراءة لملف الترجمة. روابط الملفات عشوائية، لكن أي شخص يحصل على رابط الملف يستطيع فتحه.
3. أضف Environment Variables في Vercel:
   - `ADMIN_USER`: اسم المستخدم للوحة الإدارة.
   - `ADMIN_PASSWORD`: كلمة مرور طويلة لا تقل عن 16 حرفًا.
   - `ADDON_KEY`: مفتاح عشوائي طويل لا يقل عن 24 حرفًا.
   - `BASE_URL`: رابط النشر النهائي مثل `https://your-project.vercel.app` (اختياري).
   - `MAX_UPLOAD_MB`: الحد الأعلى، افتراضيًا 300.
4. تأكد أن Blob Store مربوط ببيئة Production ثم أعد النشر.

## روابط بعد النشر
- لوحة الإدارة: `https://YOUR-PROJECT.vercel.app/`
- manifest: `https://YOUR-PROJECT.vercel.app/addon/YOUR_ADDON_KEY/manifest.json`

## ملاحظات
- الرفع المباشر يستخدم Vercel Blob Client Upload لتجاوز حد 4.5MB لطلبات Functions.
- اخترنا Blob من نوع Public حتى يستطيع Stremio تنزيل SUP من رابط مباشر. لوحة الإدارة محمية، لكن ملفات الترجمة نفسها يمكن فتحها لمن يملك رابطها.
- البيانات الوصفية تحفظ كملف JSON منفصل لكل ترجمة في Blob. هذا نموذج أولي شخصي وليس قاعدة بيانات متعددة المستخدمين.
- توافق مشغّل Stremio مع PGS/SUP غير مؤكد؛ يجب اختبار ملف صغير أولًا. لم يتم اختبار النشر الفعلي أو تشغيل SUP داخل Stremio بعد.
