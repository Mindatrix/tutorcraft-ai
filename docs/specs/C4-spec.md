# Giai đoạn C4: Khung hỏi trong cảnh, hệ quả khi sai, nhịp câu hỏi, xu

Nguồn: tài liệu Claude Docs "Giai đoạn C4" (xuất ngày 27/10). Bổ sung cho "Nhiệm vụ phần code". Làm sau C, trước D. Dự án là web học, không phải web game: không nạp tiền để thắng, xếp hạng chỉ dựa vào điểm.

## Nguyên tắc
- Câu hỏi là hành động trong game, không phải màn chắn. Mỗi nhiệm vụ gắn đúng 1 câu hỏi cổng; nhiệm vụ lớn là chuỗi 3 đến 4 câu.
- Hai loại tiền tách bạch: điểm (xếp hạng, không mua được) và xu (chỉ kiếm bằng chơi, không bán bằng tiền thật).
- Sai không bao giờ mất xu. Sai chỉ làm mất thời gian, tiến độ hoặc chuỗi đúng, và đáp án đúng luôn hiện ngay trong cảnh.
- Không máu, không súng (người chơi là trẻ em). Máy chủ chấm đáp án; không gửi đáp án xuống máy khách trước khi em trả lời (G3.3).
- Không phát âm đáp án. Chỉ có hiệu ứng âm thanh đúng, sai.

## C4.1 Khung hỏi dùng chung
| # | Việc | Xong khi | Cỡ |
|---|---|---|---|
| C4.1 | Thành phần QuestionFrame lớp phủ trong khung game: viền ánh sáng bảy màu chạy quanh, nền mờ tối nhẹ, mép viền sáng nhẹ. Mỗi game một "áo" (chất liệu viền, âm thanh): kayak dây thừng và phao, câu cá gỗ, trại hè biển gỗ, sinh tồn kim loại, khủng long bia đá, Multiverse hologram | Cả 6 game dùng cùng một thành phần, khác áo | M |
| C4.2 | Bố cục đáp án nằm trong khung: đáp án dài xếp dọc (4 đáp án), đáp án ngắn xếp ngang, dạng ghép đôi hai cột (chạm trái rồi chạm phải, nối bằng đường sáng). Chữ tối thiểu 16 px, nút tối thiểu 44 px | Đọc và bấm được ở màn 360 px, không che nhân vật quá mức | M |
| C4.3 | Máy quay áp sát vật chủ điểm hỏi trong 0,4 giây, nền mờ và tối đi, cảnh vẫn chạy phía sau; đóng lại thì khung co về vật và máy quay trượt trở lại. Ở tầng 3D thấp và 2D thì chỉ dùng khung và làm mờ | Chạy đủ ba tầng đường lùi | M |
| C4.4 | Phản hồi sau trả lời khoảng 1,5 giây, không chặn game: đúng thì âm thanh đúng, hiệu ứng trong cảnh, xu bay lên thanh xu; sai thì hiệu ứng nhẹ và đáp án đúng hiện như tấm biển trong cảnh | Có âm và hiệu ứng cho cả 6 game | M |
| C4.5 | Đồng hồ là vật trong cảnh (đuốc cháy dần, sóng dâng, vòng tròn nước); giới hạn mỗi câu 25 giây | Hết giờ tính là sai nhẹ | S |

## C4.2 Bộ lập lịch câu hỏi
| # | Việc | Xong khi | Cỡ |
|---|---|---|---|
| C4.6 | Lịch điểm hỏi tính từ đồng hồ trận đã đồng bộ cộng một hạt giống chung (không phát thêm tin nhắn). Mỗi chặng 5 phút: 20 giây mở màn, các điểm hỏi, "chốt chặng" là chuỗi 3 câu liên tiếp thưởng lớn, 25 giây cuối tổng kết và xếp hạng nhanh | 50 máy thấy cùng điểm hỏi cùng giây; tạm dừng và kéo dài vẫn đúng | L |
| C4.7 | Nhịp theo số câu của gia sư: từ 60 câu trở lên thì 8 đến 9 điểm hỏi mỗi chặng (khoảng 30 giây), mỗi chặng ứng một phần của tài liệu; 30 đến 60 câu thì 7 điểm hỏi (khoảng 35 giây); mặc định 20 câu thì 3 đến 4 câu mới mỗi chặng cộng các câu em làm sai quay lại ở dạng khác (đổi thứ tự đáp án, đổi dạng), vẫn đủ khoảng 7 điểm hỏi | Thử với 20, 45 và 90 câu đều ra đúng nhịp, một phiên 30 phút | M |
| C4.8 | Tự cân độ khó: sai 2 câu liên tiếp thì câu sau dễ hơn và tự hiện gợi ý; đúng 3 câu liên tiếp thì bật combo | Có test | S |
| C4.9 | Thử thách vàng: thỉnh thoảng một vật phát sáng, em tự chọn nhận hay không; câu khó hơn, thưởng xu gấp đôi; sai chỉ mất chuỗi đúng, không mất xu | Có test | S |
| C4.10 | Lớp 50 em: mọi em thấy cùng điểm hỏi cùng lúc, nội dung câu có thể khác theo mức của từng em | Hai em mức khác nhau cùng điểm hỏi | M |

## C4.3 Gợi ý
| # | Việc | Xong khi | Cỡ |
|---|---|---|---|
| C4.11 | Nút gợi ý hiện sau 8 giây, nhấp nháy nhẹ. Gợi ý là nhân vật đồng hành thì thầm (cha khủng long, người hướng dẫn, đài radio...), không phải hộp thoại hệ thống | Có ở cả 6 game | M |
| C4.12 | Hai bậc gợi ý: bậc 1 hiện nghĩa tiếng Việt (trừ 3 xu), bậc 2 loại bớt 2 đáp án sai (trừ 5 xu). Máy chủ trừ xu và trả gợi ý, không gửi đáp án xuống máy khách | Kiểm bằng công cụ mạng: không lộ đáp án | M |

## C4.4 Hệ quả khi trả lời sai
Mỗi game khai báo cùng một giao diện: onCorrect, onWrong, onWrongStreak, recover. Nội dung chi tiết nằm trong `content/consequences_v2.json` (đã commit).

| Game | Đúng | Sai lần 1 | Sai liên tiếp | Cách gỡ |
|---|---|---|---|---|
| Kayak Rush | Qua cổng phao đúng làn, được Nitro | Va đá, mất Nitro, chậm 2 giây | Thuyền lật, trôi lùi, đối thủ vượt | Cổng "vớt" dễ |
| River Fishing | Cá cắn, kéo cá lên | Cá rỉa mồi, hụt cá | Cá to làm cong cần, đứt dây, cá thoát | Thả mồi lại |
| Summer Camp | Cọc chắc, thịt chín đúng | Thịt rơi xuống đất, hoặc nướng gần xong thì cháy khét; cọc lều lỏng | Lều xiêu rồi sập, gió thổi bay đồ, lửa bị tắt (hợp kịch bản Bão nhỏ) | Câu sửa chữa dễ hơn |
| River Survival | Cửa thoát hiểm mở, tránh kẻ truy đuổi | Vấp ngã, đi khập, kẻ truy đuổi gần hơn | Trúng lưới và bị đóng băng 6 giây (khớp luật Cướp Lưới) | Bạn đồng đội giải cứu, cả hai được xu |
| Dino Journey | Đánh trả hoặc vượt trở ngại ở núi mới, cả bầy tiến lên | Dino con vấp té | Bầy bị tấn công dồn dập, cha phải che chắn | Câu "bảo vệ" |
| Multiverse Portal | Xuyên cổng sang không gian mới, nhận xu | Cổng rung, bị đẩy vào vùng nhiễu | Rơi vào không gian méo, phải qua cổng ổn định mới ra | Cổng ổn định dễ |

| # | Việc | Xong khi | Cỡ |
|---|---|---|---|
| C4.13 | Khung ConsequenceSystem dùng chung và hợp đồng giao diện; tích hợp 6 trạng thái hoạt ảnh avatar của C2.3 | Mỗi game đăng ký đủ 4 móc | M |
| C4.14 | Cứu hộ trong lớp: sai 3 câu liên tiếp trong một chặng thì bạn trong lớp nhận một câu cứu hộ, cả hai được xu. Sinh tồn dùng luật đóng băng và giải cứu đã có ở B2.7 | Có test với 2 em | M |
| C4.15 | Hệ quả của từng game được làm cùng lúc với game đó ở giai đoạn D, E | Mỗi game qua một trận thử | theo D, E |

## C4.5 Xu, điểm và phần thưởng (chỉ dựng dữ liệu và luật bây giờ)
| # | Việc | Xong khi | Cỡ |
|---|---|---|---|
| C4.16 | Luật xu: đúng 10; trả lời dưới 5 giây cộng 5; hệ số chuỗi tối đa x2; thử thách vàng x2; thưởng chốt chặng và hoàn thành chặng; dùng gợi ý bị trừ; tính ở máy chủ, giới hạn tần suất | Test: không gian lận được xu | M |
| C4.17 | Dữ liệu: ví xu, sổ cái xu (mỗi dòng một sự kiện), kho nhân vật, mùa giải theo tháng; RLS; điểm xếp hạng tách riêng, không có đường nào đổi điểm bằng xu | get_advisors không cảnh báo mới | M |
| C4.18 | Hộp quà sau trận: chỉ cho xu ngẫu nhiên (khoảng 20 đến 100), không bán bằng tiền thật | Có giới hạn | S |
| C4.19 | Khung viền vàng, bạc, đồng quanh avatar cho top 3 lớp, hiện cho cả lớp thấy | Hiện đúng trên màn gia sư và màn em | S |

### Làm sau, khi 6 game đã hoàn chỉnh (chưa làm bây giờ)
- Cửa hàng nhân vật: bậc thường 300 xu, hiếm 800, sử thi 2.000, huyền thoại 5.000. Một mô hình sinh nhiều bản màu (thường, vàng, băng, neon) bằng vật liệu, không tốn credit Meshy. Nhân vật hiếm mở bằng chuỗi đúng dài hoặc vào top.
- Mùa giải theo tháng: điểm tích lũy cả mùa, top mùa nhận danh hiệu và đồ độc quyền.
- Gói bán cho phụ huynh: bàn sau khi xong game; không nạp tiền, thắng bằng thực lực.

## Quyết định đã chốt (27/10)
- Nhịp câu hỏi theo bảng C4.7, có câu sai quay lại.
- Hệ quả khi sai theo bảng trên.
- Sinh tồn chia 60/40 (Chạy Trốn / Săn Tìm).
- Điểm để xếp hạng, xu để đổi nhân vật; không bán xu.

## Thành phần dùng chung RainbowEdge (C4.1 và D6.4)
Một hiệu ứng viền ánh sáng nhiều màu, làm một lần, dùng ở hai nơi: khung câu hỏi của cả 6 game và vòng cổng của Multiverse.
- Dải bảy màu quay chạy quanh viền như một vệt sáng, phát sáng nhẹ ra ngoài. Nền bên trong mờ và tối nhẹ, sáng dần về phía mép viền.
- Khung câu hỏi: hình chữ nhật bo góc, một vòng khoảng 4 giây. Mỗi game chỉ đổi chất liệu bên ngoài viền (gỗ, đá, kim loại, hologram, dây thừng), phần viền màu giống nhau.
- Cổng Multiverse: hình tròn, thêm hạt lấp lánh bay quanh, chạy nhanh hơn khi cổng đang nở.
- Máy yếu: thay bằng viền chuyển màu CSS (không shader). Có chế độ giảm chuyển động cho em nhạy cảm.
- Xong khi: một thành phần duy nhất, không có hai bản riêng cho khung hỏi và cổng.

## D6 Multiverse Portal: vòng lặp các không gian (thêm 27/10)
Bám bối cảnh và cốt truyện của video mẫu, không cần bắt chước y hệt. Giữ nguyên lõi game hiện có (Scarlet cầm kiếm rune, câu hỏi hiện thành ấn phép trên lưỡi kiếm, Boss yếu thì vết nứt mở sang thế giới mới) rồi gắn vòng lặp cổng vào.

### Cốt truyện khung
Bé ở trong phòng ngủ. Một quả cầu sáng (Lumi) hiện ra và mở cổng. Mỗi chặng là một không gian; trả lời đủ thì cổng lớn mở ra và em xuyên sang không gian kế tiếp, nhận xu. Chặng cuối có cổng quay về phòng ngủ, đóng vòng lặp. Góc nhìn thứ nhất, camera trôi chậm trên đường ray, tay cầm kiếm rune ở mép dưới màn hình.

### Nhịp xuyên cổng
1. Quả cầu sáng hiện cạnh một vật trong phòng, nở thành vòng viền bảy màu và hạt lấp lánh. Bên trong vòng là ảnh xem trước của không gian kế tiếp.
2. Camera lao vào cổng, mờ nhẹ, hạt bắn hai bên (0,4 đến 1,2 giây).
3. Đáp xuống không gian mới, camera lắc nhẹ rồi trôi chậm.
4. Lặp lại.

### Luật chơi gắn vào game
- Mỗi câu đúng: nhảy ngắn sang mỏ neo kế tiếp trong cùng phòng (hạt sáng), cổng lớn nạp thêm một phần.
- Đủ mục tiêu chặng: cổng lớn mở, xuyên sang không gian mới, nhận xu.
- Câu chốt chặng: mỗi đáp án là một cổng, mỗi cổng xem trước một không gian khác nhau. Đúng thì xuyên cổng; sai thì cổng rung và vào vùng nhiễu (khóa hệ quả trong content/consequences_v2.json).
- Chặng Boss: Boss xuất hiện trong phòng. Đúng là một đòn chém (đúng nhanh là chí mạng), sai thì Boss phản đòn nhẹ. Boss còn 50% thì vết nứt mở ra thành cổng sang chặng sau.
- Chặng 6 có cổng quay về phòng ngủ. Còn thời gian thì lặp vòng mới với thứ tự đảo (theo hạt giống).

### Kho không gian
| Mã | Nguồn | Vai trò |
|---|---|---|
| r_bedroom | Cozy Bedroom Diorama (2 bản) | Phòng ngủ của bé: nơi bắt đầu và kết thúc |
| r_cyber | Cyberpunk Room Scene | Thay bản tạm của mv_world_cyberpunk |
| r_courtyard | Japanese Courtyard (sân vườn tuyết) | Không gian mới |
| r_salon | Modern Luxury Villa (chờ xác nhận có đúng phòng khách cổ điển không) | Không gian mới |
| r_fortress | Dark fortress hoặc Heavily guarded fortress | Thay bản tạm của mv_world_castle |
| r_desert | mv_world_desert (đã có) | Sa mạc |
| r_future | Design a futuristic (cần xem lại) | Dự phòng |

Trong thư viện, mv_world_castle và mv_world_cyberpunk hiện chỉ là bí danh trỏ vào cảnh khác; cảnh mới sẽ thay chúng cho đúng. Lộ trình từng kịch bản nằm trong content/multiverse_rooms.json. Một phòng dùng lại nhiều lần với góc camera và ánh sáng khác nhau để không cần nhiều tài nguyên.

### Nhiệm vụ D6
| # | Việc | Xong khi | Cỡ |
|---|---|---|---|
| D6.1 | Tối ưu các file Meshy phòng/cảnh: tối đa 6 đến 8 MB mỗi cảnh bản cao, 2 đến 3 MB bản thấp (sân vườn Nhật 209 MB nặng nhất). Loại file không dùng (cây thông 143 MB). Chạy Blender kiểm | Mỗi cảnh qua kiểm, catalog cập nhật, alias castle và cyberpunk trỏ đúng cảnh mới | M |
| D6.2 | Dữ liệu phòng content/multiverse_rooms.json: mã phòng, tệp, mỏ neo camera (vị trí đầu, các điểm nhảy), vị trí đặt 1 đến 3 cổng, vị trí khung hỏi, ánh sáng. Claude viết khung, Code đo tọa độ bằng công cụ chọn điểm trong scene-lab | Mọi phòng có đủ mỏ neo | M |
| D6.3 | Camera trên đường ray có lắc nhẹ, nhảy ngắn giữa mỏ neo, lao vào cổng 0,4 đến 1,2 giây | Chạy mượt trên cả ba tầng đường lùi | M |
| D6.4 | Cổng: vòng shader viền bảy màu và hạt, bên trong là ảnh chụp sẵn (512 px) của không gian kế tiếp, tự sinh khi build. Máy yếu dùng làm mờ chuyển cảnh | Xem trước đúng không gian, không dựng hai cảnh cùng lúc | L |
| D6.5 | Nạp phòng: tối đa 2 phòng trong bộ nhớ, tải trước phòng kế tiếp, giải phóng phòng cũ | Vào ra 20 lần không rò rỉ | M |
| D6.6 | Luật chơi: nhảy ngắn khi đúng, nạp cổng, câu chốt chặng nhiều cổng, Boss 50% mở vết nứt, vòng lặp | Một kịch bản 6 chặng chạy đủ 30 phút | L |
| D6.7 | Lớp 50 em: mọi em cùng đi một lộ trình cùng lúc (đồng bộ bằng đồng hồ trận), màn gia sư hiện 50 em đang ở không gian nào | Hai máy thấy cùng chặng cùng giây | M |
| D6.8 | Quả cầu Lumi: nhân vật đồng hành thì thầm, mở màn | Có ở cả 6 chặng | S |

Cổng nghiệm thu D6: một kịch bản Multiverse chơi liền 30 phút trên máy tầm trung, ít nhất 30 FPS, bộ nhớ ổn, mọi hiệu ứng đúng sai khớp consequences_v2.json.
