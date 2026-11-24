import { Controller, Get } from '@nestjs/common';

/**
 * 오늘의 표현: 한·일 한 쌍. 한국인은 ja를, 일본인은 ko를 배운다.
 * 같은 날 통화하는 두 사람은 같은 표현을 서로의 언어로 보게 된다.
 * reading: 상대 언어 화자를 위한 발음 표기 (ko→카타카나, ja→한글)
 */
export type Phrase = {
  ko: string;
  ja: string;
  koReading: string; // 일본인이 한국어를 읽을 때
  jaReading: string; // 한국인이 일본어를 읽을 때
  situation: { ko: string; ja: string };
};

// ponytail: 코드에 박은 목록. 운영자가 문구를 자주 바꾸게 되면 DB 테이블 + 관리 화면으로.
export const PHRASES: Phrase[] = [
  { ko: '만나서 반가워요', ja: 'お会いできて嬉しいです', koReading: 'マンナソ パンガウォヨ', jaReading: '오아이데키테 우레시이데스', situation: { ko: '처음 만났을 때', ja: '初めて会った時' } },
  { ko: '천천히 말해 주세요', ja: 'ゆっくり話してください', koReading: 'チョンチョニ マレ ジュセヨ', jaReading: '윳쿠리 하나시테 쿠다사이', situation: { ko: '잘 못 알아들었을 때', ja: '聞き取れない時' } },
  { ko: '이거 어떻게 말해요?', ja: 'これは何と言いますか？', koReading: 'イゴ オットッケ マレヨ？', jaReading: '코레와 난토 이이마스카?', situation: { ko: '단어를 모를 때', ja: '単語がわからない時' } },
  { ko: '한 번 더 말해 주세요', ja: 'もう一度言ってください', koReading: 'ハン ボン ド マレ ジュセヨ', jaReading: '모- 이치도 잇테 쿠다사이', situation: { ko: '다시 듣고 싶을 때', ja: 'もう一度聞きたい時' } },
  { ko: '제 발음 괜찮아요?', ja: '私の発音、大丈夫ですか？', koReading: 'チェ パルム ケンチャナヨ？', jaReading: '와타시노 하츠온, 다이죠-부데스카?', situation: { ko: '말하기 연습할 때', ja: '発音を練習する時' } },
  { ko: '요즘 어떻게 지내요?', ja: '最近どうですか？', koReading: 'ヨジュム オットッケ チネヨ？', jaReading: '사이킨 도-데스카?', situation: { ko: '안부를 물을 때', ja: '近況を聞く時' } },
  { ko: '취미가 뭐예요?', ja: '趣味は何ですか？', koReading: 'チュィミガ ムォエヨ？', jaReading: '슈미와 난데스카?', situation: { ko: '대화를 시작할 때', ja: '会話のきっかけに' } },
  { ko: '추천해 주실 곳 있어요?', ja: 'おすすめの場所はありますか？', koReading: 'チュチョネ ジュシル コッ イッソヨ？', jaReading: '오스스메노 바쇼와 아리마스카?', situation: { ko: '여행을 계획할 때', ja: '旅行の計画を立てる時' } },
  { ko: '역까지 어떻게 가요?', ja: '駅までどうやって行きますか？', koReading: 'ヨッカジ オットッケ カヨ？', jaReading: '에키마데 도-얏테 이키마스카?', situation: { ko: '길을 물을 때', ja: '道を聞く時' } },
  { ko: '사진 찍어 주실 수 있어요?', ja: '写真を撮ってもらえますか？', koReading: 'サジン チゴ ジュシル ス イッソヨ？', jaReading: '샤신오 톳테 모라에마스카?', situation: { ko: '여행 중에', ja: '旅行中に' } },
  { ko: '진짜 맛있어요!', ja: '本当に美味しいです！', koReading: 'チンチャ マシッソヨ！', jaReading: '혼토-니 오이시이데스!', situation: { ko: '함께 식사할 때', ja: '一緒に食事する時' } },
  { ko: '덕분에 즐거웠어요', ja: 'おかげで楽しかったです', koReading: 'トップネ チュルゴウォッソヨ', jaReading: '오카게데 타노시캇타데스', situation: { ko: '헤어질 때', ja: '別れ際に' } },
  { ko: '다음에 또 통화해요', ja: 'また今度電話しましょう', koReading: 'タウメ ット トンファヘヨ', jaReading: '마타 콘도 뎅와 시마쇼-', situation: { ko: '통화를 마칠 때', ja: '電話を終える時' } },
  { ko: '한 번의 만남도 소중해요', ja: '一期一会を大切に', koReading: 'ハン ボネ マンナムド ソジュンヘヨ', jaReading: '이치고 이치에오 다이세츠니', situation: { ko: 'Hana의 마음', ja: 'Hanaの心' } },
];

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000; // 한국·일본 모두 UTC+9 → 양국 자정에 동시에 바뀐다

export function phraseOfDay(now = new Date()): Phrase {
  const day = Math.floor((now.getTime() + KST_OFFSET_MS) / DAY_MS);
  return PHRASES[day % PHRASES.length];
}

@Controller('phrases')
export class PhrasesController {
  @Get('today')
  today() {
    return phraseOfDay();
  }
}
