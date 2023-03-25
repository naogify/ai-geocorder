import { Configuration, OpenAIApi } from "openai";

import fs from ('fs')
import path from ('path')
import { parse } from ('csv-parse/sync');
import { Configuration, OpenAIApi } from ("openai");
import fetch from ('node-fetch');
import turf from ('@turf/turf')


const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const file = fs.readFileSync(path.join(__dirname, 'admins.csv'), 'utf8')
const admins = parse(file);

const getPlacePrompt = (input) => {

return `
- 以下の入力文の中から市区町村の地名を抽出して下さい
- 複数の地名が含まれた場合は、範囲が狭い方の地名を1つだけ抽出して下さい
- 地名以外の文字列が含まれている場合は、その文字列を削除して下さい
- 抽出した地名は、バッククォートで囲って下さい
- 地名が 「東京」 や 「京田辺」 の様なフォーマットの場合は、東京都や京田辺市の様に補完して下さい

- 入力文に地名が含まれなければ、どのエリアかも教えて下さい？と質問して下さい
- 都道府県、もしくは関東や関西、近畿のような広いエリアの範囲を指定された場合は、具体的に指定して下さいと伝えて下さい

入力文: ${input}}`

}

const getAPIQueryPrompt = (input, bbox) => {
return `あなたは、OpenStreetMap Overpass APIの専門家アシスタントです。

ユーザーの入力文に対して、アシスタントは次のように返答します：
- 質問に答えるために使用できる有効なOverpass APIクエリのテキスト。クエリは、コードブロックであることを示すために、改行で3つのバッククォートで囲む必要があります。
- APIクエリの範囲は、以下の 北東の経度、北東の緯度、南西の経度、南西の緯度 で指定された範囲にして下さい。

入力文: ${input}
北東の経度: ${bbox[2]}
北東の緯度: ${bbox[3]}
南西の経度: ${bbox[0]}
南西の緯度: ${bbox[1]}
`
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


export default async function (req, res) {
  if (!configuration.apiKey) {
    res.status(500).json({
      error: {
        message: "OpenAI API key not configured, please follow instructions in README.md",
      }
    });
    return;
  }

  const animal = req.body.animal || '';
  if (animal.trim().length === 0) {
    res.status(400).json({
      error: {
        message: "Please enter a valid animal",
      }
    });
    return;
  }

  try {
    const completion = await openai.createCompletion({
      model: "gpt-3.5-turbo",
      prompt: generatePrompt(animal),
      temperature: 0.6,
    });
    res.status(200).json({ result: completion.data.choices[0].text });
  } catch(error) {
    // Consider adjusting the error handling logic for your use case
    if (error.response) {
      console.error(error.response.status, error.response.data);
      res.status(error.response.status).json(error.response.data);
    } else {
      console.error(`Error with OpenAI API request: ${error.message}`);
      res.status(500).json({
        error: {
          message: 'An error occurred during your request.',
        }
      });
    }
  }
}

function generatePrompt(animal) {
  const capitalizedAnimal =
    animal[0].toUpperCase() + animal.slice(1).toLowerCase();
  return `Suggest three names for an animal that is a superhero.

Animal: Cat
Names: Captain Sharpclaw, Agent Fluffball, The Incredible Feline
Animal: Dog
Names: Ruff the Protector, Wonder Canine, Sir Barks-a-Lot
Animal: ${capitalizedAnimal}
Names:`;
}
