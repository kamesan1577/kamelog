import Notebook, { PreviewShell } from './notebook';
export default async function Page({searchParams}: {searchParams: Promise<{embed?: string}>}) {
 const params = await searchParams;
 return params.embed === '1' ? <Notebook/> : <PreviewShell/>;
}
