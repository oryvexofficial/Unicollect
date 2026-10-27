import { MotionConfig } from 'motion/react';
import { ToastProvider } from '../shared/chat/Toast.jsx';
import { LiveProvider } from './live.jsx';
import Layout from './Layout.jsx';
import Home from './pages/Home.jsx';
import Api from './pages/Api.jsx';
import { About, How, NotFound, Privacy } from './pages/Simple.jsx';

export const META = {
  home: { title: 'Unicollect Guard · نگهبان متن', desc: 'Unicollect Guard متن فارسی، فینگیلیش و انگلیسی را با رأی‌گیری پنج مدل بررسی می‌کند. API کامل و رایگان.', C: Home },
  api: { title: 'مستندات API · Unicollect Guard', desc: 'همه‌ی مسیرهای API نسخه‌ی ۱ Unicollect Guard با نمونه‌ی curl، JavaScript و Python و کنسول زنده.', C: Api },
  how: { title: 'فرآیند · Unicollect Guard', desc: 'از متن تا مُهر در چهار مرحله: تشخیص زبان، پرسش از مدل‌ها، رأی‌گیری و حکم نهایی.', C: How },
  about: { title: 'درباره · Unicollect Guard', desc: 'Unicollect Guard، نگهبان کوچک موویکسو برای گفت‌وگوی سالم‌تر.', C: About },
  privacy: { title: 'حریم خصوصی · Unicollect Guard', desc: 'فقط همان متنی که می‌فرستی تحلیل می‌شود؛ چیزی روی دیسک ذخیره نمی‌شود.', C: Privacy },
  notfound: { title: 'پیدا نشد · Unicollect Guard', desc: '', C: NotFound }
};

export default function Site({ page, root }) {
  const m = META[page] || META.notfound;
  const C = m.C;
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <LiveProvider root={root}>
          <Layout page={page === 'notfound' ? '' : page} root={root}><C root={root} /></Layout>
        </LiveProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
