import type { Metadata } from "next";
import {
  LegalDoc,
  LegalSection,
  LEGAL_CONTACT,
  LEGAL_SERVICE_NAME,
} from "../_components/LegalDoc";

export const metadata: Metadata = { title: "개인정보처리방침" };

export default function PrivacyPage() {
  return (
    <LegalDoc title="개인정보처리방침" effectiveDate="2026년 9월 22일">
      <LegalSection heading="1. 총칙">
        <p>
          {LEGAL_SERVICE_NAME}(이하 “회사”)는 이용자의 개인정보를 중요하게 생각하며,
          「개인정보 보호법」 등 관련 법령을 준수합니다. 본 방침은 회사가 어떤 개인정보를 어떤
          목적으로 수집·이용하며 어떻게 보호하는지를 안내합니다.
        </p>
      </LegalSection>

      <LegalSection heading="2. 수집하는 개인정보 항목">
        <p>
          회사는 서비스 제공을 위해 다음 정보를 수집합니다.
        </p>
        <p>
          · 소셜 로그인(카카오) 시: 소셜 계정 식별자, 닉네임, (동의 시) 이메일
          <br />· 회원 활동 시: 닉네임, 프로필 이미지, 최애 그룹·멤버 설정, 찜·컬렉션·주문·게시글
          <br />· 주문·거래 시: 수령인명, 연락처, 배송지 주소, 결제 관련 정보
          <br />· 자동 수집: 접속 IP, 쿠키, 기기·브라우저 정보, 서비스 이용 기록
        </p>
      </LegalSection>

      <LegalSection heading="3. 개인정보의 수집·이용 목적">
        <p>
          회원 식별 및 인증, 굿즈 판매·중고거래·경매 및 배송, 결제·정산, 고객 문의 대응,
          포인트·쿠폰·추천 등 혜택 운영, 부정 이용 방지, 서비스 개선 및 통계 분석,
          법령상 의무 이행.
        </p>
      </LegalSection>

      <LegalSection heading="4. 개인정보의 보유 및 이용 기간">
        <p>
          회사는 원칙적으로 개인정보 수집·이용 목적이 달성되면 지체 없이 파기합니다. 다만
          관련 법령에 따라 다음과 같이 일정 기간 보관합니다.
        </p>
        <p>
          · 계약 또는 청약철회 등에 관한 기록: 5년
          <br />· 대금결제 및 재화 등의 공급에 관한 기록: 5년
          <br />· 소비자의 불만 또는 분쟁처리에 관한 기록: 3년
          <br />· 접속 로그 등 통신사실확인자료: 3개월
        </p>
      </LegalSection>

      <LegalSection heading="5. 개인정보의 제3자 제공">
        <p>
          회사는 이용자의 동의 없이 개인정보를 외부에 제공하지 않습니다. 다만 배송, 결제 등
          서비스 이행에 필요한 범위에서 해당 업무 수행에 필요한 최소한의 정보를 제공하거나,
          법령에 근거한 요청이 있는 경우 예외로 합니다.
        </p>
      </LegalSection>

      <LegalSection heading="6. 개인정보 처리의 위탁">
        <p>
          회사는 서비스 운영을 위해 클라우드 인프라(Amazon Web Services), 소셜 로그인 제공자
          등에 개인정보 처리를 위탁할 수 있으며, 위탁 시 관련 법령에 따라 안전하게 관리되도록
          합니다. 위탁 내용이 변경되면 본 방침을 통해 고지합니다.
        </p>
      </LegalSection>

      <LegalSection heading="7. 이용자의 권리">
        <p>
          이용자는 언제든지 자신의 개인정보를 조회·수정하거나 처리 정지·삭제(회원탈퇴)를
          요청할 수 있습니다. 회원정보 화면에서 직접 변경하거나 아래 연락처로 요청하시면 지체
          없이 조치합니다. 회원탈퇴 시 관련 법령상 보관 의무가 있는 정보를 제외하고 즉시
          파기합니다.
        </p>
      </LegalSection>

      <LegalSection heading="8. 개인정보의 파기">
        <p>
          보유기간이 경과하거나 처리 목적이 달성된 개인정보는 재생이 불가능한 방법으로
          파기합니다. 전자적 파일은 복구할 수 없도록 삭제하고, 출력물은 분쇄하거나 소각합니다.
        </p>
      </LegalSection>

      <LegalSection heading="9. 개인정보의 안전성 확보 조치">
        <p>
          회사는 개인정보에 대한 접근 통제, 접속 기록의 보관, 전송 구간 암호화(TLS), 비밀번호
          등 인증정보의 해시 저장 등 관리적·기술적 보호조치를 시행합니다.
        </p>
      </LegalSection>

      <LegalSection heading="10. 쿠키의 운영">
        <p>
          회사는 로그인 유지와 이용 편의를 위해 쿠키를 사용합니다. 이용자는 브라우저 설정에서
          쿠키 저장을 거부할 수 있으나, 이 경우 로그인 등 일부 서비스 이용이 제한될 수
          있습니다.
        </p>
      </LegalSection>

      <LegalSection heading="11. 개인정보 보호책임자 및 문의">
        <p>
          개인정보 처리에 관한 문의·불만·피해 구제는 아래로 연락해 주세요.
          <br />· 이메일: <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>
        </p>
        <p>
          그 밖의 개인정보 침해에 대한 신고·상담은 개인정보분쟁조정위원회(1833-6972),
          개인정보침해신고센터(118), 대검찰청 사이버수사과(1301), 경찰청 사이버수사국(182)에
          문의하실 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection heading="12. 방침의 변경">
        <p>
          본 방침은 법령·서비스 변경에 따라 개정될 수 있으며, 개정 시 시행일과 변경 내용을
          서비스 화면에 공지합니다.
        </p>
      </LegalSection>
    </LegalDoc>
  );
}
