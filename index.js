const { Configuration, OpenAIApi } = require("openai");
const fetch = require('node-fetch');
const turf = require('@turf/turf')
const { normalize } = require('@geolonia/normalize-japanese-addresses')

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const CHAT_TEMPLATE = (human_input, bbox) => {

  return `Assistant is an expert OpenStreetMap Overpass API assistant.

  For each question that the user supplies, the assistant will reply with:
  (1) A statement consenting to help.
  (2) The text of a valid Overpass API query that can be used to answer the question. The query should be enclosed by three backticks on new lines, denoting that it is a code block. The area of the query should be specified by the following bounding box: ${bbox}.

  Assistant has a whimsical personality. Assistant will reply with a geospatial themed joke or a pun if the user asks a question that is not relevant to the Overpass API.

  {history}
  Human: ${human_input}
  Assistant:
  `
}

const READER_TEMPLATE = () => {

  return `Read the following Overpass API response carefully. Use the information in it to answer the prompt "{prompt}" Your answer should not mention the words "API" or "Overpass." Your answer should sound like it was spoken by someone with personal knowledge of the question's answer. Your answer should be very concise, but also informative and fun. Format any names or places you get from the API response as bold text in Markdown.
  Overpass API Response:
  Answer: {response}
  `
}

const requestOpenAI = async (CHAT_TEMPLATE) => {

  const openai = new OpenAIApi(configuration);

  return await openai.createCompletion({
    model: "text-davinci-003",
    prompt: CHAT_TEMPLATE,
    temperature: 0,
    max_tokens: 516,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0
  });
}

const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

const queryOverpass = async (query) => {

  const payload = new URLSearchParams({
    data: query
  });

  const options = {
    method: 'POST',
    body: payload.toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };

  const response = await fetch(OVERPASS_API_URL, options);
  return await response.json();
}

const main = async () => {

  const input = '誕生日におすすめの、北海道伊達市のレストランを探して下さい'

  const addressesResult = await requestOpenAI(`以下の入力文の中から、住所文字列を抽出して下さい: ${input}`)
  // 結果から改行文字と記号を削除
  const address = addressesResult.data.choices[0].text.replace(/\n/g, '').replace(/[^\w\sぁ-んァ-ン一-龯]|_/g, "");
  const normalized = await normalize(address)

  if (!normalized.pref || !normalized.city) {
    return '都道府県、もしくは市区町村が見つかりませんでした'
  }

  const url = `https://naogify.github.io/japanese-admins/${normalized.pref}/${normalized.city}.json`
  const cityResponse = await fetch(url)
  const json = await cityResponse.json()

  const bbox = turf.bbox(json)
  const queryResponse = await requestOpenAI(CHAT_TEMPLATE(input, [bbox[1], bbox[0], bbox[3], bbox[2]]))
  const query = queryResponse.data.choices[0].text.match(/```([\s\S]*?)```/g)[0].replace(/```/g, '')

  const response = await queryOverpass(query)

  const geojson = {
    type: 'FeatureCollection',
    features: []
  }

  for (const element of response.elements) {
    if (element.type === 'node') {

      geojson.features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [element.lon, element.lat]
        },
        properties: element.tags
      })
    }
  }

  return geojson
}

console.log(main())


// const file = fs.readFileSync(path.join(__dirname, 'admins.csv'), 'utf8')
// const admins = parse(file);

// const getPlacePrompt = (input) => {

//   return `
// - 以下の入力文の中から市区町村の地名を抽出して下さい
// - 複数の地名が含まれた場合は、範囲が狭い方の地名を1つだけ抽出して下さい
// - 地名以外の文字列が含まれている場合は、その文字列を削除して下さい
// - 抽出した地名は、バッククォートで囲って下さい
// - 地名が 「東京」 や 「京田辺」 の様なフォーマットの場合は、東京都や京田辺市の様に補完して下さい

// - 入力文に地名が含まれなければ、どのエリアかも教えて下さい？と質問して下さい
// - 都道府県、もしくは関東や関西、近畿のような広いエリアの範囲を指定された場合は、具体的に指定して下さいと伝えて下さい

// 入力文: ${input}}`

// }

// const getAPIQueryPrompt = (input, bbox) => {
//   return `あなたは、OpenStreetMap Overpass APIの専門家アシスタントです。

// ユーザーの入力文に対して、アシスタントは次のように返答します：
// - 質問に答えるために使用できる有効なOverpass APIクエリのテキスト。クエリは、コードブロックであることを示すために、改行で3つのバッククォートで囲む必要があります。
// - APIクエリの範囲は、以下の 北東の経度、北東の緯度、南西の経度、南西の緯度 で指定された範囲にして下さい。

// 入力文: ${input}
// 北東の経度: ${bbox[2]}
// 北東の緯度: ${bbox[3]}
// 南西の経度: ${bbox[0]}
// 南西の緯度: ${bbox[1]}
// `
// }





// async function main() {

//   const input = "京田辺市のレストランを探して下さい"

//   const response = await requestOpenAI(getPlacePrompt(input));

//   const result = response.data.choices[0].text;

//   console.log(result);

//   const isPlaceName = result.match("`");

//   if (isPlaceName) {

//     // 改行や空白文字を削除
//     const placeName = result.replace(/`/g, "").replace(/\r?\n/g, "").replace(/\s+/g, "");

//     if (!placeName) {
//       console.log("地名が抽出されませんでした");
//       return;
//     }

//     const placeData = admins.find((admin) => {
//       return admin[2] === placeName;
//     });

//     const code = placeData[0];
//     const prefCode = code.slice(0, 2);

//     const url = `https://geolonia.github.io/japanese-admins/${prefCode}/${code}.json`;
//     const response = await fetch(url);

//     if (!response.ok) {
//       console.log("地名が抽出されませんでした");
//       return;
//     }

//     const data = await response.json();

//     // turfjs でバウンディングボックスを取得
//     const bbox = turf.bbox(data);

//     const responseQuery = await requestOpenAI(getAPIQueryPrompt(input, bbox));

//     const query = responseQuery.data.choices[0].text.replace(/`/g, "");

//     console.log(query);

//     // const places = await queryOverpass(query);

//     // const features = places.elements.map(node => ({
//     //   type: 'Feature',
//     //   geometry: {
//     //     type: 'Point',
//     //     coordinates: [node.lon, node.lat]
//     //   },
//     //   properties: node.tags
//     // }));

//     // const geojson = {
//     //   type: 'FeatureCollection',
//     //   features: features
//     // };

//     // return geojson;


//   } else {
//     console.log("地名が抽出されませんでした");
//   }

// }

// main()

