import { config } from 'dotenv'
import OpenAI from 'openai'

config()

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export default openai
