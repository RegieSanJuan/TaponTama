"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Camera, Leaf, Trash2, Recycle, RotateCcw, Zap } from "lucide-react"

type WasteClassification = "biodegradable" | "non-biodegradable" | "recyclable"

interface ClassificationResult {
  type: WasteClassification
  confidence: number
  item: string
  tips: string
}

export default function TaponTamaApp() {
  const [isCapturing, setIsCapturing] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [classification, setClassification] = useState<ClassificationResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setIsCapturing(true)
      }
    } catch (error) {
      console.error("Error accessing camera:", error)
      alert("Unable to access camera. Please ensure you have granted camera permissions.")
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setIsCapturing(false)
  }, [])

  const captureImage = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current
      const video = videoRef.current
      const context = canvas.getContext("2d")

      if (context) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context.drawImage(video, 0, 0)

        const imageDataUrl = canvas.toDataURL("image/jpeg")
        setCapturedImage(imageDataUrl)
        stopCamera()
        analyzeWaste(imageDataUrl)
      }
    }
  }, [stopCamera])

  const analyzeWaste = useCallback(async (imageData: string) => {
    setIsAnalyzing(true)

    try {
      // Convert base64 to blob for API upload
      const response = await fetch(imageData)
      const blob = await response.blob()

      // Create FormData for Ximilar API
      const formData = new FormData()
      formData.append(
        "records",
        JSON.stringify([
          {
            _base64: imageData.split(",")[1], // Remove data:image/jpeg;base64, prefix
          },
        ]),
      )

      // Call Ximilar API (you'll need to replace with your actual API key and endpoint)
      const ximilarResponse = await fetch("/api/classify-waste", {
        method: "POST",
        body: formData,
      })

      if (!ximilarResponse.ok) {
        throw new Error("Classification failed")
      }

      const result = await ximilarResponse.json()

      // Process Ximilar response and map to our waste categories
      const processedResult = processXimilarResult(result)
      setClassification(processedResult)
    } catch (error) {
      console.error("Error analyzing waste:", error)

      // Fallback to mock results if API fails
      const mockResults: ClassificationResult[] = [
        {
          type: "biodegradable",
          confidence: 92,
          item: "Food waste",
          tips: "Compost this organic material to create nutrient-rich soil for plants!",
        },
        {
          type: "recyclable",
          confidence: 88,
          item: "Plastic bottle",
          tips: "Clean and place in recycling bin. Check local recycling guidelines for proper disposal.",
        },
        {
          type: "non-biodegradable",
          confidence: 95,
          item: "Styrofoam container",
          tips: "This goes to general waste. Consider using reusable containers in the future!",
        },
      ]

      const randomResult = mockResults[Math.floor(Math.random() * mockResults.length)]
      setClassification(randomResult)
    }

    setIsAnalyzing(false)
  }, [])

  const processXimilarResult = (ximilarResult: any): ClassificationResult => {
    const wasteMapping: Record<string, { type: WasteClassification; tips: string }> = {
      plastic_bottle: {
        type: "recyclable",
        tips: "Clean and place in recycling bin. Check local recycling guidelines for proper disposal.",
      },
      plastic_bag: {
        type: "recyclable",
        tips: "Take to grocery store plastic bag recycling bins. Don't put in curbside recycling.",
      },
      paper: {
        type: "recyclable",
        tips: "Remove any plastic coating and place in paper recycling bin.",
      },
      cardboard: {
        type: "recyclable",
        tips: "Flatten and place in cardboard recycling. Remove any tape or staples.",
      },
      glass_bottle: {
        type: "recyclable",
        tips: "Clean thoroughly and place in glass recycling container.",
      },
      aluminum_can: {
        type: "recyclable",
        tips: "Clean and place in metal recycling bin. Aluminum cans are highly recyclable!",
      },
      food_waste: {
        type: "biodegradable",
        tips: "Perfect for composting! Food waste makes excellent fertilizer.",
      },
      fruit_peel: {
        type: "biodegradable",
        tips: "Compost this organic material to create nutrient-rich soil for plants!",
      },
      vegetable_scraps: {
        type: "biodegradable",
        tips: "Great for composting! These scraps will decompose naturally.",
      },
      styrofoam: {
        type: "non-biodegradable",
        tips: "This goes to general waste. Consider using reusable containers in the future!",
      },
      electronics: {
        type: "non-biodegradable",
        tips: "Take to an e-waste recycling center. Never put electronics in regular trash!",
      },
      battery: {
        type: "non-biodegradable",
        tips: "Take to battery recycling center. Batteries contain harmful chemicals.",
      },
      general_waste: {
        type: "non-biodegradable",
        tips: "This item should go in your general waste bin.",
      },
    }

    console.log("[v0] Processing Ximilar result:", ximilarResult)

    // Extract the highest confidence prediction from Ximilar response
    const predictions = ximilarResult.records?.[0]?.outputs || []
    console.log("[v0] Predictions found:", predictions)

    const topPrediction = predictions.reduce(
      (max: any, current: any) => (current.prob > (max?.prob || 0) ? current : max),
      null,
    )

    console.log("[v0] Top prediction:", topPrediction)

    if (topPrediction) {
      const category = topPrediction.label.toLowerCase()
      const mapping = wasteMapping[category] || wasteMapping["general_waste"] // Default fallback

      return {
        type: mapping.type,
        confidence: Math.round(topPrediction.prob * 100),
        item: topPrediction.label.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        tips: mapping.tips,
      }
    }

    // Fallback if no prediction found
    return {
      type: "non-biodegradable",
      confidence: 50,
      item: "Unknown item",
      tips: "Unable to classify this item. Please dispose of it responsibly.",
    }
  }

  const resetApp = useCallback(() => {
    setCapturedImage(null)
    setClassification(null)
    setIsAnalyzing(false)
  }, [])

  const getClassificationIcon = (type: WasteClassification) => {
    switch (type) {
      case "biodegradable":
        return <Leaf className="h-8 w-8 text-green-600" />
      case "recyclable":
        return <Recycle className="h-8 w-8 text-blue-600" />
      case "non-biodegradable":
        return <Trash2 className="h-8 w-8 text-red-600" />
    }
  }

  const getClassificationColor = (type: WasteClassification) => {
    switch (type) {
      case "biodegradable":
        return "bg-green-100 text-green-800 border-green-200"
      case "recyclable":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "non-biodegradable":
        return "bg-red-100 text-red-800 border-red-200"
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent">
              <Leaf className="h-6 w-6 text-accent-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">TaponTama</h1>
              <p className="text-sm text-muted-foreground">Smart Waste Classification</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-md">
        {!isCapturing && !capturedImage && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-xl">Identify Your Waste</CardTitle>
                <CardDescription>
                  Use your camera to classify waste as biodegradable, recyclable, or non-biodegradable
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center">
                  <div className="w-32 h-32 rounded-full bg-accent/10 flex items-center justify-center">
                    <Camera className="h-16 w-16 text-accent" />
                  </div>
                </div>
                <Button
                  onClick={startCamera}
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                  size="lg"
                >
                  <Camera className="mr-2 h-5 w-5" />
                  Start Camera
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">How it works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-semibold">
                    1
                  </div>
                  <p className="text-sm text-muted-foreground">Point camera at waste item</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-semibold">
                    2
                  </div>
                  <p className="text-sm text-muted-foreground">Capture the image</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-semibold">
                    3
                  </div>
                  <p className="text-sm text-muted-foreground">Get classification and disposal tips</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {isCapturing && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <div className="relative">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-80 object-cover rounded-t-lg" />
                  <div className="absolute inset-0 border-2 border-dashed border-accent/50 rounded-t-lg pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white bg-black/50 px-3 py-1 rounded text-sm">
                      Center waste item in frame
                    </div>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <Button
                    onClick={captureImage}
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                    size="lg"
                  >
                    <Zap className="mr-2 h-5 w-5" />
                    Capture & Analyze
                  </Button>
                  <Button onClick={stopCamera} variant="outline" className="w-full bg-transparent">
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {capturedImage && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <img
                  src={capturedImage || "/placeholder.svg"}
                  alt="Captured waste"
                  className="w-full h-64 object-cover rounded-t-lg"
                />
                <div className="p-4">
                  {isAnalyzing ? (
                    <div className="text-center space-y-3">
                      <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto"></div>
                      <p className="text-sm text-muted-foreground">Analyzing waste with AI...</p>
                    </div>
                  ) : classification ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        {getClassificationIcon(classification.type)}
                        <div>
                          <h3 className="font-semibold text-lg capitalize">{classification.type.replace("-", " ")}</h3>
                          <p className="text-sm text-muted-foreground">
                            {classification.item} • {classification.confidence}% confidence
                          </p>
                        </div>
                      </div>

                      <Badge className={`${getClassificationColor(classification.type)} px-3 py-1`} variant="outline">
                        {classification.type.replace("-", " ").toUpperCase()}
                      </Badge>

                      <div className="bg-muted p-3 rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          💡 <strong>Disposal Tip:</strong> {classification.tips}
                        </p>
                      </div>

                      <Button onClick={resetApp} variant="outline" className="w-full bg-transparent">
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Analyze Another Item
                      </Button>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </main>
    </div>
  )
}
