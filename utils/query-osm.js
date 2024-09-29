import OpenAI from "openai";
import fetch from "node-fetch";
import * as turf from '@turf/turf'
import { normalize } from "@geolonia/normalize-japanese-addresses";

const createPromptForOSMQuery = (bbox) => {

  return `Assistant is an expert OpenStreetMap Overpass API assistant.
  For each question that the user supplies, the assistant will reply with: The text of a valid Overpass API query that can be used to answer the question.
  The query should be enclosed by three backticks on new lines, denoting that it is a code block.
  The area of the query should be specified by the following bounding box: ${bbox}.`
}

const requestOpenAI = async (humanInput, systemInput, responseFormat) => {

  const openai = new OpenAI();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0, // 回答を一定にする
    max_tokens: 2048,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    response_format: {
      "type": responseFormat || "text"
    },
    messages: [
      { role: "system", content: systemInput },
      {
        role: "user",
        content: humanInput,
      },
    ],
  });

  return completion.choices[0].message.content;
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

export const queryOsmData = async (input) => {

  // OpenAIで市区町村名を抽出
  const userInput = `次の入力文から市区町村名を抽出して下さい。入力文:${input}`
  const systemPromptForGetCity = "与えられた入力文から市区町村名を抽出して下さい。レスポンスは市区町村名のみとして下さい。記号等も必要ありません。"
  const cityRaw = await requestOpenAI(userInput, systemPromptForGetCity)

  // 改行と記号を削除
  const city = cityRaw.replace(/\n/g, '').replace(/[^\w\sぁ-んァ-ン一-龯]|_/g, "");

  // 都道府県名と市区町村名を取得
  const normalized = await normalize(city)

  if (!normalized.pref) {
    throw new Error("都道府県名が分かりませんでした");
  }

  if (!normalized.city) {
    throw new Error("市区町村名が分かりませんでした");
  }

  // 都道府県名と、市区町村名を APIに投げて行政ポリゴンを取得
  const url = `https://naogify.github.io/japanese-admins/${normalized.pref}/${normalized.city}.json`
  const cityResponse = await fetch(url)
  const json = await cityResponse.json()
  const bbox = turf.bbox(json)

  if (!bbox) {
    throw new Error("市区町村名が正しくありません。");
  }

  // バウンディングボックスと入力文を OpenAI に渡して Overpass API のクエリを生成
  const promptForOSMQuery = createPromptForOSMQuery(bbox)
  const queryRaw = await requestOpenAI(userInput, promptForOSMQuery);
  // バッククォート内のクエリを取得
  const query = queryRaw.match(/```([\s\S]*?)```/g)[0].replace(/```/g, '')

  // Overpass API にクエリを投げて結果を取得
  const response = await queryOverpass(query);

  const geojson = {
    type: 'FeatureCollection',
    features: []
  }

  for (const element of response.elements) {
    if (
      element.type === 'node' &&
      element.tags &&
      element.tags.hasOwnProperty('name')
    ) {
      geojson.features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [element.lon, element.lat]
        },
        properties: {
          title: element.tags.name,
        }
      })
    }
  }

  return {
    geojson,
    query
  }
}
