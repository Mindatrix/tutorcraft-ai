import { redirect } from 'next/navigation';

// Trang xem & chọn nhân vật (268 nhân vật, 5 game) – bản Three.js tĩnh trong /public.
export default function CharactersPage() {
  redirect('/character-picker/index.html');
}
