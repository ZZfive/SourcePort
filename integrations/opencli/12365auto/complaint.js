import { cli, Strategy } from '@jackwener/opencli/registry';
const BASE = 'https://www.12365auto.com';
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const html = async (url) => { const r = await fetch(url, { headers: { 'user-agent': 'SourcePort/1.0 read-only' } }); if (!r.ok) throw new Error(`12365auto HTTP ${r.status}`); return await r.text(); };
const rows = (body, query) => {
  const text = body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  return [...body.matchAll(/href=[\"']([^\"']*\/zlts\/\d{8}\/\d+\.shtml)[\"'][^>]*>([^<]{2,160})</gi)].map((m) => {
    const id = m[1].match(/\/(\d+)\.shtml/)?.[1] ?? '';
    const around = text.slice(Math.max(0, text.indexOf(m[2]) - 300), text.indexOf(m[2]) + 300);
    const value = (label) => around.match(new RegExp(label + '\\s*[:：]?\\s*([^\\s]{1,40})'))?.[1] ?? '';
    return { complaintId: id, brand: value('投诉品牌'), series: value('投诉车系') || clean(query), model: value('投诉车型'), summary: clean(m[2]), submittedAt: value('投诉时间'), status: value('处理状态') || 'unknown', url: new URL(m[1], BASE).href };
  });
};
cli({ site:'12365auto', name:'complaint', description:'Retrieve one public 12365auto complaint (read-only)', access:'read', domain:'12365auto', strategy:Strategy.PUBLIC, browser:false, args:[{name:'complaint', positional:true, required:true, help:'Complaint id'},{name:'limit',type:'int',default:20,help:'Maximum rows (1-50)'}], columns:['complaintId','brand','series','model','summary','submittedAt','status','url'], func:async ({complaint}) => { const body=await html(`${BASE}/zlts/${complaint}.shtml`); const out=rows(body, complaint).slice(0,1); if(!out.length) throw new Error('12365auto returned no usable complaints'); return out; } });
