import { Configuration, OpenAIApi } from "openai";
import fetch from "node-fetch";
import * as turf from '@turf/turf'
import { normalize } from "@geolonia/normalize-japanese-addresses";

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

export const queryOsmData = async (input) => {

  const addressesResult = await requestOpenAI(`次の入力文から市区町村名を抽出して下さい。入力文:${input}`)
  
  const address = addressesResult.data.choices[0].text.replace(/\n/g, '').replace(/[^\w\sぁ-んァ-ン一-龯]|_/g, "");
  const normalized = await normalize(address)

  if (!normalized.pref || !normalized.city) {
    throw new Error("市区町村名を入力して下さい。");
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