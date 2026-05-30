/**
 * Seed dữ liệu mẫu cho Telemedicine DB
 * ───────────────────────────────────────────────────────────────────────────
 * Tạo dữ liệu mẫu đầy đủ cho 15 bảng: tài khoản (1 admin + 1 y tá + 5 bác sĩ
 * + 9 bệnh nhân), lịch làm việc, lịch khám đa trạng thái, hồ sơ bệnh án,
 * đánh giá, chỉ số sức khoẻ, đơn nghỉ phép, và đơn thanh toán SePay.
 *
 * Cách chạy (cần DB đang chạy trước):
 *     node prisma/seed.js
 *     # hoặc nếu đã cấu hình `prisma.seed` trong package.json:
 *     npx prisma db seed
 *
 * Mật khẩu mặc định cho TẤT CẢ tài khoản mẫu:  Password@123
 *
 * Tài khoản tạo:
 *   ADMIN    admintelemedicine@gmail.com
 *   NURSE    nursetelemedicine@gmail.com
 *   DOCTOR   dr.hung.noi@gmail.com       Nội tổng quát   (đã duyệt)
 *   DOCTOR   dr.lan.tim@gmail.com        Tim mạch        (đã duyệt)
 *   DOCTOR   dr.tuan.nhi@gmail.com       Nhi khoa        (đã duyệt)
 *   DOCTOR   dr.hang.da@gmail.com        Da liễu         (đã duyệt)
 *   DOCTOR   dr.son.thankinh@gmail.com   Thần kinh   (CHƯA duyệt)
 *   PATIENT  patient1@gmail.com … patient9@gmail.com
 *
 * Idempotent: chạy lại nhiều lần luôn cho kết quả như nhau — xoá các tài khoản
 * mẫu cũ (theo email) cùng dữ liệu liên quan rồi tạo lại. Không động đến tài
 * khoản nằm ngoài danh sách email mẫu.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const PWD = 'Password@123';

function daysFromNow(n) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

const SEED_EMAILS = [
  'admintelemedicine@gmail.com',
  'nursetelemedicine@gmail.com',
  'dr.hung.noi@gmail.com',
  'dr.lan.tim@gmail.com',
  'dr.tuan.nhi@gmail.com',
  'dr.hang.da@gmail.com',
  'dr.son.thankinh@gmail.com',
  ...Array.from({ length: 9 }, (_, i) => `patient${i + 1}@gmail.com`),
];

async function main() {
  console.log('⏳ Bắt đầu seed dữ liệu mẫu Telemedicine...\n');

  // ─── 1. CLEANUP ───────────────────────────────────────────────
  // Xoá các tài khoản mẫu cũ (cascade các bảng phụ thuộc).
  const del = await prisma.user.deleteMany({
    where: { email: { in: SEED_EMAILS } },
  });
  console.log(`  • Đã xoá ${del.count} tài khoản mẫu cũ + dữ liệu liên quan.`);

  const hash = await bcrypt.hash(PWD, 12);

  // ─── 2. ADMIN ─────────────────────────────────────────────────
  await prisma.user.create({
    data: {
      email: 'admintelemedicine@gmail.com',
      password_hash: hash,
      role: 'ADMIN',
      profile: {
        create: {
          full_name: 'Quản trị viên Hệ thống',
          phone: '0900000001',
          gender: 'MALE',
          address: 'Hà Nội',
        },
      },
    },
  });

  // ─── 3. NURSE ─────────────────────────────────────────────────
  await prisma.user.create({
    data: {
      email: 'nursetelemedicine@gmail.com',
      password_hash: hash,
      role: 'NURSE',
      profile: {
        create: {
          full_name: 'Y tá Lê Thị Mai',
          phone: '0900000002',
          gender: 'FEMALE',
          address: 'Hà Nội',
        },
      },
    },
  });

  // ─── 4. DOCTORS ───────────────────────────────────────────────
  const doctorsData = [
    {
      email: 'dr.hung.noi@gmail.com', name: 'Nguyễn Văn Hùng',
      phone: '0900100001', gender: 'MALE', spec: 'Nội tổng quát',
      exp: 12, fee: 300000, verified: true,
      bio: 'Bác sĩ chuyên khoa Nội với 12 năm kinh nghiệm khám và điều trị các bệnh nội khoa.',
    },
    {
      email: 'dr.lan.tim@gmail.com', name: 'Trần Thị Lan',
      phone: '0900100002', gender: 'FEMALE', spec: 'Tim mạch',
      exp: 15, fee: 500000, verified: true,
      bio: 'Chuyên gia Tim mạch, từng tu nghiệp tại nước ngoài.',
    },
    {
      email: 'dr.tuan.nhi@gmail.com', name: 'Lê Minh Tuấn',
      phone: '0900100003', gender: 'MALE', spec: 'Nhi khoa',
      exp: 8, fee: 250000, verified: true,
      bio: 'Bác sĩ Nhi khoa, tận tâm với bệnh nhân nhỏ tuổi.',
    },
    {
      email: 'dr.hang.da@gmail.com', name: 'Phạm Thu Hằng',
      phone: '0900100004', gender: 'FEMALE', spec: 'Da liễu',
      exp: 10, fee: 350000, verified: true,
      bio: 'Chuyên khoa Da liễu, điều trị các bệnh ngoài da và thẩm mỹ y khoa.',
    },
    {
      email: 'dr.son.thankinh@gmail.com', name: 'Hoàng Văn Sơn',
      phone: '0900100005', gender: 'MALE', spec: 'Thần kinh',
      exp: 6, fee: 400000, verified: false,
      bio: 'Bác sĩ Thần kinh — hồ sơ đang chờ Admin duyệt.',
    },
  ];

  const doctors = [];
  for (const d of doctorsData) {
    const u = await prisma.user.create({
      data: {
        email: d.email,
        password_hash: hash,
        role: 'DOCTOR',
        profile: {
          create: {
            full_name: d.name,
            phone: d.phone,
            gender: d.gender,
            address: 'Hà Nội',
            doctorDetails: {
              create: {
                specialization: d.spec,
                experience_years: d.exp,
                consultation_fee: d.fee,
                bio: d.bio,
                qualifications: ['Bác sĩ – Đại học Y Hà Nội'],
                is_verified: d.verified,
              },
            },
          },
        },
      },
      include: { profile: { include: { doctorDetails: true } } },
    });
    doctors.push({
      user: u,
      doctorDetailsId: u.profile.doctorDetails.id,
      verified: d.verified,
    });
  }

  // ─── 5. PATIENTS ──────────────────────────────────────────────
  const patientsData = [
    { name: 'Nguyễn Văn An',   phone: '0901000001', gender: 'MALE',   dob: '1995-03-15', blood: 'O+'  },
    { name: 'Trần Thị Bình',   phone: '0901000002', gender: 'FEMALE', dob: '1990-07-22', blood: 'A+'  },
    { name: 'Lê Minh Châu',    phone: '0901000003', gender: 'FEMALE', dob: '1988-11-10', blood: 'B+'  },
    { name: 'Phạm Quốc Dũng',  phone: '0901000004', gender: 'MALE',   dob: '1985-05-05', blood: 'AB+' },
    { name: 'Hoàng Thị Em',    phone: '0901000005', gender: 'FEMALE', dob: '1992-12-01', blood: 'O-'  },
    { name: 'Vũ Văn Phong',    phone: '0901000006', gender: 'MALE',   dob: '1998-08-18', blood: 'A-'  },
    { name: 'Đỗ Thị Giang',    phone: '0901000007', gender: 'FEMALE', dob: '1993-02-28', blood: 'B-'  },
    { name: 'Bùi Văn Huy',     phone: '0901000008', gender: 'MALE',   dob: '1996-10-09', blood: 'O+'  },
    { name: 'Mai Thị Linh',    phone: '0901000009', gender: 'FEMALE', dob: '1991-04-14', blood: 'A+'  },
  ];

  const patients = [];
  for (let i = 0; i < patientsData.length; i++) {
    const p = patientsData[i];
    const u = await prisma.user.create({
      data: {
        email: `patient${i + 1}@gmail.com`,
        password_hash: hash,
        role: 'PATIENT',
        profile: {
          create: {
            full_name: p.name,
            phone: p.phone,
            gender: p.gender,
            date_of_birth: new Date(p.dob),
            address: 'Hà Nội',
            patientDetails: {
              create: {
                blood_type: p.blood,
                allergies: i % 3 === 0 ? ['Penicillin'] : [],
                medical_history: i % 4 === 0 ? 'Tiền sử cao huyết áp nhẹ.' : null,
                emergency_contact: {
                  name: 'Người thân',
                  phone: '0911999000',
                  relationship: 'Vợ/Chồng',
                },
              },
            },
          },
        },
      },
      include: { profile: { include: { patientDetails: true } } },
    });
    patients.push({
      user: u,
      patientDetailsId: u.profile.patientDetails.id,
    });
  }

  console.log(`  • Tạo ${1 + 1 + doctors.length + patients.length} tài khoản ` +
              `(1 admin, 1 y tá, ${doctors.length} bác sĩ, ${patients.length} bệnh nhân).`);

  // ─── 6. SCHEDULES ─────────────────────────────────────────────
  // Mỗi bác sĩ đã duyệt: lịch làm việc cho hôm nay + 5 ngày tới.
  let scheduleCount = 0;
  for (const d of doctors.filter((x) => x.verified)) {
    for (let off = 0; off < 6; off++) {
      await prisma.schedule.create({
        data: {
          doctor_id: d.doctorDetailsId,
          date: daysFromNow(off),
          start_time: '08:00',
          end_time: '17:00',
          slot_duration: 30,
        },
      });
      scheduleCount++;
    }
  }
  console.log(`  • Tạo ${scheduleCount} lịch làm việc cho ${doctors.filter((x) => x.verified).length} bác sĩ đã duyệt.`);

  // ─── 7. APPOINTMENTS — đa dạng trạng thái ────────────────────
  const dateStr = (d) => d.toISOString().slice(0, 10);
  const apCode = (d) => `AP-${dateStr(d).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const apts = [
    // 4 COMPLETED (đã khám xong) — có hồ sơ bệnh án + có thể đánh giá
    { p: 0, d: 0, day: -7, start: '09:00', end: '09:30', status: 'COMPLETED', type: 'OFFLINE', note: 'Ho và đau họng kéo dài 3 ngày' },
    { p: 1, d: 1, day: -5, start: '14:00', end: '14:30', status: 'COMPLETED', type: 'ONLINE',  note: 'Đau tức ngực thỉnh thoảng' },
    { p: 2, d: 2, day: -3, start: '10:00', end: '10:30', status: 'COMPLETED', type: 'OFFLINE', note: 'Con sốt 2 ngày, ăn kém' },
    { p: 3, d: 3, day: -2, start: '15:00', end: '15:30', status: 'COMPLETED', type: 'OFFLINE', note: 'Mẩn ngứa vùng cánh tay' },
    // 1 CANCELLED
    { p: 4, d: 0, day: -4, start: '11:00', end: '11:30', status: 'CANCELLED', type: 'OFFLINE',
      note: 'Khám sức khoẻ định kỳ', reason: 'Bệnh nhân huỷ' },
    // 1 NO_SHOW
    { p: 5, d: 1, day: -1, start: '16:00', end: '16:30', status: 'NO_SHOW', type: 'OFFLINE',
      note: 'Kiểm tra tim mạch', reason: 'Auto: end of slot reached without front-desk check-in' },
    // 1 IN_PROGRESS hôm nay
    { p: 6, d: 2, day: 0, start: '08:30', end: '09:00', status: 'IN_PROGRESS', type: 'OFFLINE', note: 'Khám sức khoẻ trẻ em' },
    // 2 CONFIRMED sắp tới
    { p: 7, d: 0, day: 1, start: '10:00', end: '10:30', status: 'CONFIRMED', type: 'OFFLINE', note: 'Đau lưng dưới' },
    { p: 8, d: 3, day: 2, start: '14:00', end: '14:30', status: 'CONFIRMED', type: 'ONLINE',
      note: 'Tư vấn các vấn đề da liễu' },
    // 2 PENDING (chờ thanh toán)
    { p: 0, d: 1, day: 3, start: '09:00', end: '09:30', status: 'PENDING', type: 'ONLINE',
      note: 'Khám sàng lọc tim mạch' },
    { p: 1, d: 2, day: 4, start: '11:00', end: '11:30', status: 'PENDING', type: 'OFFLINE',
      note: 'Khám nhi khoa định kỳ' },
  ];

  const createdApts = [];
  for (const a of apts) {
    const appointmentDate = daysFromNow(a.day);
    const apt = await prisma.appointment.create({
      data: {
        appointment_code: apCode(appointmentDate),
        patient_id: patients[a.p].patientDetailsId,
        doctor_id: doctors[a.d].doctorDetailsId,
        appointment_date: appointmentDate,
        start_time: a.start,
        end_time: a.end,
        status: a.status,
        appointment_type: a.type,
        meeting_url: a.type === 'ONLINE' ? `/teleconsultation/room/${apCode(appointmentDate)}` : null,
        cancellation_reason: a.reason || null,
        patient_note: a.note,
      },
    });
    createdApts.push(apt);
  }
  console.log(`  • Tạo ${createdApts.length} lịch khám (COMPLETED ×4, CANCELLED ×1, NO_SHOW ×1, IN_PROGRESS ×1, CONFIRMED ×2, PENDING ×2).`);

  // ─── 8. MEDICAL RECORDS — cho 4 lịch khám đã COMPLETED ───────
  const completed = createdApts.filter((a) => a.status === 'COMPLETED');
  const recordsData = [
    {
      diagnosis: 'Viêm họng cấp', code: 'J02.9',
      prescription: 'Amoxicillin 500mg, 1 viên × 3 lần/ngày × 7 ngày. Paracetamol 500mg khi sốt > 38.5°C.',
      treatment: 'Uống nhiều nước, nghỉ ngơi, hạn chế nói nhiều.',
      advice: 'Tránh thực phẩm cay, lạnh. Tái khám sau 1 tuần nếu không thuyên giảm.',
    },
    {
      diagnosis: 'Đau thắt ngực không ổn định', code: 'I20.0',
      prescription: 'Aspirin 81mg, 1 viên/ngày sau ăn sáng. Atorvastatin 20mg, 1 viên/tối.',
      treatment: 'Đo ECG, siêu âm tim Doppler. Theo dõi tại nhà.',
      advice: 'Giảm muối, tăng vận động nhẹ. Theo dõi huyết áp hàng ngày. Tái khám sau 2 tuần.',
    },
    {
      diagnosis: 'Sốt do nhiễm virus', code: 'B34.9',
      prescription: 'Paracetamol siro 250mg, 4 lần/ngày khi sốt > 38.5°C. Bù nước Oresol.',
      treatment: 'Nghỉ ngơi tại nhà, lau mát khi sốt cao.',
      advice: 'Theo dõi nhiệt độ. Nếu sốt cao kéo dài > 3 ngày cần đưa trẻ tái khám.',
    },
    {
      diagnosis: 'Viêm da tiếp xúc dị ứng', code: 'L23.9',
      prescription: 'Loratadine 10mg, 1 viên/ngày × 7 ngày. Bôi kem Hydrocortisone 1% × 2 lần/ngày.',
      treatment: 'Tránh tiếp xúc với dị nguyên đã xác định.',
      advice: 'Không gãi, không cào. Mặc quần áo cotton thoáng mát. Tái khám sau 2 tuần.',
    },
  ];
  for (let i = 0; i < Math.min(completed.length, recordsData.length); i++) {
    await prisma.medicalRecord.create({
      data: {
        appointment_id: completed[i].id,
        patient_id: completed[i].patient_id,
        doctor_id: completed[i].doctor_id,
        diagnosis: recordsData[i].diagnosis,
        diagnostic_code: recordsData[i].code,
        prescription: recordsData[i].prescription,
        treatment: recordsData[i].treatment,
        doctor_advice: recordsData[i].advice,
      },
    });
  }
  console.log(`  • Tạo ${Math.min(completed.length, recordsData.length)} hồ sơ bệnh án.`);

  // ─── 9. REVIEWS — cho 3 ca đã hoàn tất ───────────────────────
  const reviews = [
    { rating: 5, comment: 'Bác sĩ tận tình, giải thích rõ ràng và dễ hiểu. Rất hài lòng.' },
    { rating: 4, comment: 'Khám kỹ, đơn thuốc phù hợp. Cảm ơn bác sĩ.' },
    { rating: 5, comment: 'Bác sĩ thân thiện, hướng dẫn cụ thể. Sẽ giới thiệu cho người thân.' },
  ];
  for (let i = 0; i < Math.min(completed.length, reviews.length); i++) {
    await prisma.review.create({
      data: {
        appointment_id: completed[i].id,
        patient_id: completed[i].patient_id,
        doctor_id: completed[i].doctor_id,
        rating: reviews[i].rating,
        comment: reviews[i].comment,
      },
    });
  }
  // Cập nhật điểm trung bình & tổng số đánh giá cho bác sĩ
  for (const d of doctors.filter((x) => x.verified)) {
    const agg = await prisma.review.aggregate({
      where: { doctor_id: d.doctorDetailsId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    if (agg._count._all > 0) {
      await prisma.doctorDetails.update({
        where: { id: d.doctorDetailsId },
        data: {
          average_rating: agg._avg.rating || 0,
          total_reviews: agg._count._all,
        },
      });
    }
  }
  console.log(`  • Tạo ${Math.min(completed.length, reviews.length)} đánh giá, cập nhật điểm trung bình bác sĩ.`);

  // ─── 10. HEALTH METRICS ─────────────────────────────────────
  let hmCount = 0;
  for (let i = 0; i < patients.length; i++) {
    for (let j = 0; j < 2; j++) {
      await prisma.healthMetric.create({
        data: {
          patient_id: patients[i].patientDetailsId,
          date: daysFromNow(-j * 3),
          weight: 55 + i * 1.5 + (j ? 0.3 : 0),
          height: 160 + i * 1.2,
          heart_rate: 70 + (i % 5),
          blood_pressure: `${118 + (i % 6)}/${75 + (i % 4)}`,
          temperature: 36.5 + (i % 3) * 0.1,
          bmi: ((55 + i * 1.5) / Math.pow((160 + i * 1.2) / 100, 2)).toFixed(1) * 1,
        },
      });
      hmCount++;
    }
  }
  console.log(`  • Tạo ${hmCount} bản ghi chỉ số sức khoẻ.`);

  // ─── 11. LEAVE REQUESTS ─────────────────────────────────────
  await prisma.leaveRequest.create({
    data: {
      doctor_id: doctors[1].doctorDetailsId,
      date: daysFromNow(10),
      session: 'FULL_DAY',
      reason: 'Tham dự hội thảo chuyên môn',
      status: 'APPROVED',
    },
  });
  await prisma.leaveRequest.create({
    data: {
      doctor_id: doctors[2].doctorDetailsId,
      date: daysFromNow(7),
      session: 'AFTERNOON',
      reason: 'Việc cá nhân',
      status: 'PENDING',
    },
  });
  console.log(`  • Tạo 2 đơn nghỉ phép (1 APPROVED, 1 PENDING).`);

  // ─── 12. ORDERS + PAYMENT LOGS ──────────────────────────────
  // 1 đơn PAID — gắn với 1 lịch ONLINE đã CONFIRMED
  const onlineConfirmed = createdApts.find(
    (a) => a.status === 'CONFIRMED' && a.appointment_type === 'ONLINE',
  );
  if (onlineConfirmed) {
    const order1 = await prisma.order.create({
      data: {
        user_id: patients[8].user.id,
        appointment_id: onlineConfirmed.id,
        amount: 350000,
        status: 'PAID',
        transfer_code: `DH${String(10000001).padStart(8, '0')}`,
        sepay_txn_id: BigInt(10000001),
      },
    });
    await prisma.paymentLog.create({
      data: {
        order_id: order1.id,
        result: 'ok',
        raw_payload: {
          id: 10000001,
          content: order1.transfer_code,
          transferAmount: 350000,
          transferType: 'in',
        },
      },
    });
  }
  // 1 đơn PENDING — gắn với lịch ONLINE PENDING
  const onlinePending = createdApts.find(
    (a) => a.status === 'PENDING' && a.appointment_type === 'ONLINE',
  );
  if (onlinePending) {
    await prisma.order.create({
      data: {
        user_id: patients[0].user.id,
        appointment_id: onlinePending.id,
        amount: 500000,
        status: 'PENDING',
        transfer_code: `DH${String(10000002).padStart(8, '0')}`,
      },
    });
  }
  // 1 đơn FAILED — không gắn lịch
  await prisma.order.create({
    data: {
      user_id: patients[2].user.id,
      amount: 200000,
      status: 'FAILED',
      transfer_code: `DH${String(10000003).padStart(8, '0')}`,
    },
  });
  console.log(`  • Tạo 3 đơn thanh toán SePay (PAID, PENDING, FAILED).`);

  console.log('\n✅ Seed thành công!\n');
  console.log('   Đăng nhập (mọi tài khoản dùng mật khẩu: Password@123):');
  console.log('   ─────────────────────────────────────────────────────');
  console.log('   ADMIN    admintelemedicine@gmail.com');
  console.log('   NURSE    nursetelemedicine@gmail.com');
  console.log('   DOCTOR   dr.hung.noi@gmail.com       (Nội tổng quát)');
  console.log('   DOCTOR   dr.lan.tim@gmail.com        (Tim mạch)');
  console.log('   DOCTOR   dr.tuan.nhi@gmail.com       (Nhi khoa)');
  console.log('   DOCTOR   dr.hang.da@gmail.com        (Da liễu)');
  console.log('   DOCTOR   dr.son.thankinh@gmail.com   (chưa duyệt)');
  console.log('   PATIENT  patient1@gmail.com … patient9@gmail.com');
}

main()
  .catch((e) => {
    console.error('❌ Seed lỗi:', e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
